import type { Cmdline, Cursor, Key, Mode, OperatorKind, PressResult, RegisterContent, Snapshot } from './types'
import { parseKeys } from './types'
import * as M from './motions'
import { textObject } from './textobjects'
import { Registers } from './registers'
import { compilePattern, findNext, wordUnderCursorPattern } from './search'
import { parseSubstitute, substituteLine } from './ex'

const SHIFTWIDTH = 2

interface BlockCtx {
  firstLine: number
  lastLine: number
  /** c/I：矩形左边界；A：右边界 + 1 */
  col: number
  /** A 模式要求行长 > col-1，c/I 要求行长 > col */
  mode: 'c' | 'A' | 'I'
  /** 进入时首行长度（用于推算键入文本） */
  origLen: number
}

const ok = (changed = false, message?: string): PressResult => ({ handled: true, changed, message })

/** 块插入可生效行：A 需行长 > col-1，c/I 需行长 > col */
const blockLineOk = (line: string, ctx: BlockCtx): boolean =>
  ctx.mode === 'A' ? line.length > ctx.col - 1 : line.length > ctx.col

const cmp = (a: Cursor, b: Cursor) => a.line - b.line || a.col - b.col
const minC = (a: Cursor, b: Cursor) => (cmp(a, b) <= 0 ? a : b)
const maxC = (a: Cursor, b: Cursor) => (cmp(a, b) >= 0 ? a : b)

export class VimEngine {
  lines: string[]
  cursor: Cursor
  mode: Mode = 'normal'
  count: number | null = null
  registerName: string | null = null
  operator: OperatorKind | null = null
  visualAnchor: Cursor | null = null
  cmdline: Cmdline | null = null
  message: string | null = null
  desiredCol: number | null = null

  private opCount: number | null = null
  private awaitingRegister = false
  private awaitingFind: 'f' | 'F' | 't' | 'T' | null = null
  private awaitingObject: 'i' | 'a' | null = null
  private awaitingG = false
  private lastFind: { dir: 1 | -1; till: boolean; ch: string } | null = null
  private lastChangeKeys: Key[] | null = null
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private registers = new Registers()
  private lastPattern: { re: RegExp; dir: 1 | -1 } | null = null
  private blockCtx: BlockCtx | null = null
  // —— 变更记录（供 `.` 与 undo）——
  private trace: Key[] = []
  private cmdStart = 0
  private changeStart: number | null = null
  private undoSnap: Snapshot | null = null
  private changeDirty = false
  private replaying = false
  private ver = 0

  constructor(init: { lines: string[]; cursor?: Cursor }) {
    this.lines = init.lines.length ? [...init.lines] : ['']
    const c = init.cursor ?? { line: 0, col: 0 }
    this.cursor = this.clamp(c)
  }

  // ========== 公开 API ==========

  press(key: Key): PressResult {
    this.message = null
    const verBefore = this.ver
    if (!this.replaying) this.trace.push(key)
    let r: PressResult
    if (this.mode === 'cmdline') r = this.pressCmdline(key)
    else if (this.mode === 'insert') r = this.pressInsert(key)
    else if (this.mode.startsWith('visual')) r = this.pressVisual(key)
    else r = this.pressNormal(key)
    if (r.message) this.message = r.message
    if (this.ver !== verBefore && r.handled) r = { ...r, changed: true }
    return r
  }

  pressAll(seq: string | Key[]): PressResult[] {
    const keys = typeof seq === 'string' ? parseKeys(seq) : seq
    return keys.map((k) => this.press(k))
  }

  snapshot(): Snapshot {
    return { lines: [...this.lines], cursor: { ...this.cursor } }
  }

  /** 按键回显栏内容：寄存器前缀 + count + operator + 等待态 / cmdline 文本 */
  pendingEcho(): string {
    if (this.mode === 'cmdline' && this.cmdline) {
      const lead = this.cmdline.kind === 'ex' ? ':' : this.cmdline.kind === 'search-fwd' ? '/' : '?'
      return lead + this.cmdline.text
    }
    let s = ''
    if (this.registerName) s += `"${this.registerName}`
    if (this.operator) {
      if (this.opCount != null) s += this.opCount
      s += this.operator
      if (this.count != null) s += this.count
    } else if (this.count != null) {
      s += this.count
    }
    if (this.awaitingG) s += 'g'
    if (this.awaitingFind) s += this.awaitingFind
    if (this.awaitingObject) s += this.awaitingObject
    return s
  }

  /** 视觉区选择范围（无视觉模式时 null） */
  selectionRange(): { start: Cursor; end: Cursor; kind: 'char' | 'line' | 'block' } | null {
    if (!this.visualAnchor || !this.mode.startsWith('visual')) return null
    const a = this.visualAnchor
    const c = this.cursor
    if (this.mode === 'visual-line') {
      const l1 = Math.min(a.line, c.line)
      const l2 = Math.max(a.line, c.line)
      return { start: { line: l1, col: 0 }, end: { line: l2, col: 0 }, kind: 'line' }
    }
    if (this.mode === 'visual-block') {
      const l1 = Math.min(a.line, c.line)
      const l2 = Math.max(a.line, c.line)
      const c1 = Math.min(a.col, c.col)
      const c2 = Math.max(a.col, c.col)
      return { start: { line: l1, col: c1 }, end: { line: l2, col: c2 }, kind: 'block' }
    }
    return { start: minC(a, c), end: maxC(a, c), kind: 'char' }
  }

  getRegister(name: string): RegisterContent | null {
    return this.registers.get(name)
  }

  // ========== 内部工具 ==========

  private clamp(c: Cursor): Cursor {
    const line = Math.min(Math.max(c.line, 0), this.lines.length - 1)
    const len = this.lines[line].length
    return { line, col: Math.min(Math.max(c.col, 0), Math.max(0, len - 1)) }
  }

  private setLines(next: string[]): void {
    this.lines = next.length ? next : ['']
    this.ver++
    if (this.changeStart != null) this.changeDirty = true
    this.cursor = this.clamp(this.cursor)
  }

  /** 读取并消费寄存器前缀（寄存器只作用于单条命令） */
  private takeRegister(): string | null {
    const r = this.registerName
    this.registerName = null
    return r
  }

  private resetCmd(): void {
    this.cmdStart = this.trace.length
    this.clearPending()
  }

  /** visual 模式下命令完成后保留 cmdStart，使 `.` 能记录完整 visual 序列 */
  private endCommand(): void {
    if (this.mode.startsWith('visual')) this.clearPending()
    else this.resetCmd()
  }

  private clearPending(): void {
    this.count = null
    this.opCount = null
    this.operator = null
    this.registerName = null
    this.awaitingRegister = false
    this.awaitingFind = null
    this.awaitingObject = null
    this.awaitingG = false
  }

  private beginChange(startIdx?: number): void {
    this.changeStart = startIdx ?? this.cmdStart
    this.undoSnap = this.snapshot()
    this.changeDirty = false
  }

  private endChange(): void {
    if (this.changeStart != null) {
      if (this.changeDirty && this.undoSnap) {
        this.undoStack.push(this.undoSnap)
        if (this.undoStack.length > 500) this.undoStack.shift()
        this.redoStack = []
      }
      if (!this.replaying) this.lastChangeKeys = this.trace.slice(this.changeStart)
    }
    this.changeStart = null
    this.undoSnap = null
    this.cmdStart = this.trace.length
  }

  private enterInsert(at: Cursor): void {
    if (this.changeStart == null) this.beginChange()
    this.mode = 'insert'
    this.cursor = { line: at.line, col: at.col }
  }

  // ========== normal 模式 ==========

  private pressNormal(key: Key): PressResult {
    if (this.awaitingRegister) {
      this.registerName = key
      this.awaitingRegister = false
      return ok()
    }
    if (this.awaitingFind) {
      const op = this.awaitingFind
      this.awaitingFind = null
      return this.execFind(op, key)
    }
    if (this.awaitingObject) {
      const inner = this.awaitingObject === 'i'
      this.awaitingObject = null
      return this.execTextObject(inner, key)
    }
    if (this.awaitingG) {
      this.awaitingG = false
      if (key === 'g') return this.execMotion('gg')
      this.resetCmd()
      return { handled: false }
    }
    if (key >= '1' && key <= '9') {
      this.count = (this.count ?? 0) * 10 + Number(key)
      return ok()
    }
    if (key === '0' && this.count != null) {
      this.count = this.count * 10
      return ok()
    }
    if (key === '"') {
      this.awaitingRegister = true
      return ok()
    }

    switch (key) {
      case '<Esc>':
        this.resetCmd()
        return ok()
      case 'g':
        this.awaitingG = true
        return ok()
      case 'd':
      case 'c':
      case 'y':
      case '>':
      case '<':
        return this.startOperator(key)
      case 'h':
      case 'l':
      case 'j':
      case 'k':
      case 'w':
      case 'b':
      case 'e':
      case '0':
      case '^':
      case '$':
      case 'G':
        return this.execMotion(key)
      case 'f':
      case 'F':
      case 't':
      case 'T':
        this.awaitingFind = key
        return ok()
      case ';':
      case ',':
        return this.execRepeatFind(key)
      case 'x':
        return this.execDeleteChars(1, this.effCount())
      case 'X':
        return this.execDeleteChars(-1, this.effCount())
      case 'D':
        return this.execMotionToEnd('d')
      case 'C':
        return this.execMotionToEnd('c')
      case 's':
        return this.execChangeChars(this.effCount())
      case 'S': {
        const n = this.effCount()
        this.execLinewiseOp('c', n)
        return ok(true)
      }
      case 'Y': {
        const n = this.effCount()
        this.execLinewiseOp('y', n)
        return ok()
      }
      case 'J':
        return this.execJoin(this.effCount())
      case 'p':
        return this.execPut(false)
      case 'P':
        return this.execPut(true)
      case 'A':
        this.beginChange()
        this.enterInsert({ line: this.cursor.line, col: this.lines[this.cursor.line].length })
        return ok(true)
      case 'I':
        this.beginChange()
        this.enterInsert({ line: this.cursor.line, col: M.firstNonBlank(this.lines[this.cursor.line]) })
        return ok(true)
      case 'i':
      case 'a':
        if (this.operator) {
          this.awaitingObject = key
          return ok()
        }
        this.beginChange()
        if (key === 'a' && this.lines[this.cursor.line].length > 0) {
          this.enterInsert({ line: this.cursor.line, col: this.cursor.col + 1 })
        } else {
          this.enterInsert({ ...this.cursor })
        }
        return ok(true)
      case 'o':
      case 'O': {
        this.beginChange()
        const l = key === 'o' ? this.cursor.line + 1 : this.cursor.line
        const next = [...this.lines]
        next.splice(l, 0, '')
        this.setLines(next)
        this.enterInsert({ line: l, col: 0 })
        return ok(true)
      }
      case 'u':
        return this.execUndo(this.count ?? 1)
      case '<C-r>':
        return this.execRedo(this.count ?? 1)
      case '.':
        return this.execDot()
      case 'v':
        this.mode = 'visual-char'
        this.visualAnchor = { ...this.cursor }
        return ok()
      case 'V':
        this.mode = 'visual-line'
        this.visualAnchor = { ...this.cursor }
        return ok()
      case '<C-v>':
        this.mode = 'visual-block'
        this.visualAnchor = { ...this.cursor }
        return ok()
      case ':':
        this.mode = 'cmdline'
        this.cmdline = { kind: 'ex', text: '' }
        return ok()
      case '/':
        this.mode = 'cmdline'
        this.cmdline = { kind: 'search-fwd', text: '' }
        return ok()
      case '?':
        this.mode = 'cmdline'
        this.cmdline = { kind: 'search-bwd', text: '' }
        return ok()
      case 'n':
      case 'N':
        return this.execSearchNext(key === 'n' ? 1 : -1)
      case '#':
      case '*':
        return this.execSearchWord(key === '*' ? 1 : -1)
      default:
        this.resetCmd()
        return { handled: false }
    }
  }

  private effCount(): number {
    const n = (this.opCount ?? 1) * (this.count ?? 1)
    const reg = this.registerName
    this.clearPending()
    this.registerName = reg
    return n
  }

  private startOperator(op: OperatorKind): PressResult {
    if (this.operator === op) {
      const n = this.effCount()
      this.beginChange()
      try {
        this.execLinewiseOp(op, n)
      } finally {
        if (op !== 'c') this.endChange()
      }
      return ok(true)
    }
    this.opCount = this.count
    this.count = null
    this.operator = op
    return ok()
  }

  private execLinewiseOp(op: OperatorKind, n: number): void {
    const l1 = this.cursor.line
    const l2 = Math.min(l1 + n - 1, this.lines.length - 1)
    const range = this.lines.slice(l1, l2 + 1)
    if (op === 'y') {
      this.registers.yank(this.takeRegister(), { text: range, linewise: true, blockwise: false })
      this.cursor = { line: l1, col: M.firstNonBlank(this.lines[l1]) }
      return
    }
    if (op === '>') {
      const next = this.lines.map((l, i) => (i >= l1 && i <= l2 ? ' '.repeat(SHIFTWIDTH) + l : l))
      this.setLines(next)
      this.cursor = { line: l1, col: Math.min(this.cursor.col + SHIFTWIDTH, Math.max(0, this.lines[l1].length - 1)) }
      return
    }
    if (op === '<') {
      const next = this.lines.map((l, i) => {
        if (i < l1 || i > l2) return l
        const m = l.match(/^ {1,2}/)
        return m ? l.slice(m[0].length) : l
      })
      this.setLines(next)
      this.cursor = { line: l1, col: Math.max(0, this.cursor.col - SHIFTWIDTH) }
      return
    }
    if (op === 'c') {
      const next = [...this.lines.slice(0, l1), '', ...this.lines.slice(l2 + 1)]
      this.setLines(next)
      this.registers.delete(this.takeRegister(), { text: range, linewise: true, blockwise: false })
      this.enterInsert({ line: l1, col: 0 })
      return
    }
    // d
    const next = [...this.lines.slice(0, l1), ...this.lines.slice(l2 + 1)]
    this.setLines(next)
    this.registers.delete(this.takeRegister(), { text: range, linewise: true, blockwise: false })
    this.cursor = { line: Math.min(l1, this.lines.length - 1), col: M.firstNonBlank(this.lines[Math.min(l1, this.lines.length - 1)]) }
  }

  private execMotion(name: string): PressResult {
    const eff = this.operator ? (this.opCount ?? 1) * (this.count ?? 1) : this.count ?? 1
    let mr: M.MotionResult
    if (name === 'j' || name === 'k') {
      if (this.desiredCol == null) this.desiredCol = this.cursor.col
    }
    switch (name) {
      case 'h':
        mr = M.charLeft(this.lines, this.cursor, eff)
        break
      case 'l':
        mr = M.charRight(this.lines, this.cursor, eff)
        break
      case 'j':
        mr = M.lineDown(this.lines, this.cursor, eff, this.desiredCol)
        break
      case 'k':
        mr = M.lineUp(this.lines, this.cursor, eff, this.desiredCol)
        break
      case 'w':
        mr = M.wordMotion('w', this.lines, this.cursor, eff)
        break
      case 'b':
        mr = M.wordMotion('b', this.lines, this.cursor, eff)
        break
      case 'e':
        mr = M.wordMotion('e', this.lines, this.cursor, eff)
        break
      case '0':
        mr = M.lineStart(this.lines, this.cursor)
        break
      case '^':
        mr = M.firstNonBlankMotion(this.lines, this.cursor)
        break
      case '$':
        mr = M.lineEnd(this.lines, this.cursor, eff)
        break
      case 'gg':
        mr = M.gotoLine(this.lines, this.count ?? 1)
        break
      case 'G':
        mr = M.gotoLine(this.lines, this.count ?? null)
        break
      default:
        this.resetCmd()
        return { handled: false }
    }
    if (this.operator) {
      let kind = mr.kind
      let target = mr.target
      // cw 特例：非空白上相当于 ce
      if (name === 'w' && this.operator === 'c') {
        const cls = M.classOf(this.lines, this.cursor)
        if (cls !== 'space' && cls !== 'eol') {
          const e = M.wordMotion('e', this.lines, this.cursor, eff)
          mr = e
          kind = e.kind
          target = e.target
        }
      }
      // dw 不跨行：目标在后续行时截断到行尾（vim 行为）
      if (name === 'w' && target.line > this.cursor.line) {
        target = { line: this.cursor.line, col: this.lines[this.cursor.line].length }
        kind = 'exclusive'
      }
      const op = this.operator
      this.clearPending()
      this.execOperatorRange(op, this.cursor, target, kind)
      this.endCommand()
      return ok(this.ver > 0)
    }
    if (name === 'j' || name === 'k') {
      if (this.mode === 'visual-block') {
        // 块选择允许光标虚越行尾（vim 的虚拟边缘）
        const line =
          name === 'j'
            ? Math.min(this.cursor.line + eff, this.lines.length - 1)
            : Math.max(0, this.cursor.line - eff)
        this.cursor = { line, col: this.desiredCol ?? this.cursor.col }
      } else {
        this.cursor = this.clamp(mr.target)
      }
    } else {
      this.cursor = this.clamp(mr.target)
      this.desiredCol = this.cursor.col
    }
    this.endCommand()
    return ok()
  }

  private execOperatorRange(op: OperatorKind, aRaw: Cursor, bRaw: Cursor, kind: M.MotionKind | 'char' | 'line' | 'block'): void {
    if (kind === 'linewise' || kind === 'line') {
      const l1 = Math.min(aRaw.line, bRaw.line)
      const l2 = Math.max(aRaw.line, bRaw.line)
      this.cursor = { ...this.cursor, line: l1 }
      if (op === 'y') {
        this.execLinewiseOp('y', l2 - l1 + 1)
        return
      }
      this.beginChange()
      try {
        if (op === 'c') {
          this.execLinewiseOp('c', l2 - l1 + 1)
        } else {
          this.cursor = { line: l1, col: this.cursor.col }
          this.execLinewiseOp(op, l2 - l1 + 1)
        }
      } finally {
        if (op !== 'c') this.endChange()
      }
      return
    }
    // 字符级
    let a = { ...aRaw }
    let b = { ...bRaw }
    let inclusive = kind === 'inclusive'
    if (cmp(a, b) > 0) {
      ;[a, b] = [b, a]
      if (kind === 'exclusive') inclusive = false
    }
    if (kind === 'exclusive') {
      const prev = M.prevChar(this.lines, b)
      if (!prev || cmp(prev, a) < 0) {
        // 空范围
        this.resetCmd()
        return
      }
      b = prev
      inclusive = true
    }
    if (!inclusive && kind !== 'inclusive') {
      // 未知类型防御
      inclusive = true
    }
    if (op === 'y') {
      this.yankRange(a, b)
      this.resetCmd()
      return
    }
    this.beginChange()
    try {
      if (op === 'c') {
        this.deleteRange(a, b)
        this.cursor = { line: a.line, col: a.col }
        this.enterInsert({ line: a.line, col: a.col })
      } else if (op === '>') {
        const l1 = Math.min(a.line, b.line)
        const l2 = Math.max(a.line, b.line)
        this.cursor = { ...this.cursor, line: l1 }
        this.execLinewiseOp('>', l2 - l1 + 1)
      } else if (op === '<') {
        const l1 = Math.min(a.line, b.line)
        const l2 = Math.max(a.line, b.line)
        this.cursor = { ...this.cursor, line: l1 }
        this.execLinewiseOp('<', l2 - l1 + 1)
      } else {
        this.deleteRange(a, b)
        this.cursor = this.clamp(a)
      }
    } finally {
      if (op !== 'c') this.endChange()
    }
  }

  private yankRange(a: Cursor, b: Cursor): void {
    if (a.line === b.line) {
      const text = this.lines[a.line].slice(a.col, b.col + 1)
      this.registers.yank(this.takeRegister(), { text: [text], linewise: false, blockwise: false })
    } else {
      const text = [
        this.lines[a.line].slice(a.col),
        ...this.lines.slice(a.line + 1, b.line),
        this.lines[b.line].slice(0, b.col + 1),
      ]
      this.registers.yank(this.takeRegister(), { text, linewise: false, blockwise: false })
    }
    this.cursor = { ...a }
  }

  private deleteRange(a: Cursor, b: Cursor): void {
    let removed: string[]
    let next: string[]
    if (a.line === b.line) {
      removed = [this.lines[a.line].slice(a.col, b.col + 1)]
      next = [...this.lines]
      next[a.line] = this.lines[a.line].slice(0, a.col) + this.lines[a.line].slice(b.col + 1)
    } else {
      removed = [
        this.lines[a.line].slice(a.col),
        ...this.lines.slice(a.line + 1, b.line),
        this.lines[b.line].slice(0, b.col + 1),
      ]
      const joined = this.lines[a.line].slice(0, a.col) + this.lines[b.line].slice(b.col + 1)
      next = [...this.lines.slice(0, a.line), joined, ...this.lines.slice(b.line + 1)]
    }
    this.setLines(next)
    this.registers.delete(this.takeRegister(), { text: removed, linewise: false, blockwise: false })
    this.cursor = this.clamp(a)
  }

  private execFind(op: 'f' | 'F' | 't' | 'T', ch: Key): PressResult {
    const eff = this.operator ? (this.opCount ?? 1) * (this.count ?? 1) : this.count ?? 1
    const till = op === 't' || op === 'T'
    const dir: 1 | -1 = op === 'f' || op === 't' ? 1 : -1
    const idx = M.findChar(this.lines[this.cursor.line], this.cursor.col, ch, eff, dir, till)
    this.lastFind = { dir, till, ch }
    if (idx == null || idx < 0 || (till && idx === this.cursor.col)) {
      this.resetCmd()
      return ok(false)
    }
    const target = { line: this.cursor.line, col: idx }
    if (this.operator) {
      const kind: M.MotionKind = till || dir === -1 ? 'exclusive' : 'inclusive'
      const opk = this.operator
      this.clearPending()
      this.execOperatorRange(opk, this.cursor, target, kind)
      this.endCommand()
      return ok(true)
    }
    this.cursor = target
    this.desiredCol = this.cursor.col
    this.endCommand()
    return ok()
  }

  private execRepeatFind(key: Key): PressResult {
    if (!this.lastFind) {
      this.resetCmd()
      return { handled: false }
    }
    const eff = this.count ?? 1
    let { dir, till, ch } = this.lastFind
    if (key === ',') dir = (dir === 1 ? -1 : 1) as 1 | -1
    const idx = M.findChar(this.lines[this.cursor.line], this.cursor.col, ch, eff, dir, till)
    if (idx == null || idx < 0) {
      this.resetCmd()
      return ok(false)
    }
    if (this.operator) {
      const kind: M.MotionKind = till || dir === -1 ? 'exclusive' : 'inclusive'
      const opk = this.operator
      this.clearPending()
      this.execOperatorRange(opk, this.cursor, { line: this.cursor.line, col: idx }, kind)
      this.endCommand()
      return ok(true)
    }
    this.cursor = { line: this.cursor.line, col: idx }
    this.desiredCol = this.cursor.col
    this.endCommand()
    return ok()
  }

  private execTextObject(inner: boolean, obj: string): PressResult {
    const range = textObject(inner, obj, this.lines, this.cursor)
    if (!range) {
      this.resetCmd()
      return { handled: false }
    }
    if (this.operator) {
      const op = this.operator
      this.clearPending()
      this.execOperatorRange(op, range.start, range.end, range.linewise ? 'linewise' : 'inclusive')
      this.endCommand()
      return ok(true)
    }
    if (this.mode.startsWith('visual')) {
      this.visualAnchor = range.start
      this.cursor = range.end
      if (range.linewise) this.mode = 'visual-line'
      this.clearPending()
      return ok()
    }
    this.resetCmd()
    return { handled: false }
  }

  private execDeleteChars(dirX: 1 | -1, n: number): PressResult {
    const line = this.lines[this.cursor.line]
    if (line.length === 0) return ok(false)
    this.beginChange()
    try {
      if (dirX === 1) {
        const end = Math.min(this.cursor.col + n - 1, line.length - 1)
        const removed = line.slice(this.cursor.col, end + 1)
        const next = [...this.lines]
        next[this.cursor.line] = line.slice(0, this.cursor.col) + line.slice(end + 1)
        this.setLines(next)
        this.registers.delete(this.takeRegister(), { text: [removed], linewise: false, blockwise: false })
      } else {
        const start = Math.max(0, this.cursor.col - n)
        const removed = line.slice(start, this.cursor.col + 1)
        const next = [...this.lines]
        next[this.cursor.line] = line.slice(0, start) + line.slice(this.cursor.col + 1)
        this.setLines(next)
        this.cursor = { line: this.cursor.line, col: start }
        this.registers.delete(this.takeRegister(), { text: [removed], linewise: false, blockwise: false })
      }
    } finally {
      this.endChange()
    }
    return ok(true)
  }

  private execMotionToEnd(op: 'd' | 'c'): PressResult {
    const n = this.count ?? 1
    const line = Math.min(this.cursor.line + n - 1, this.lines.length - 1)
    const target = { line, col: Math.max(0, this.lines[line].length - 1) }
    this.beginChange()
    try {
      if (op === 'd') {
        this.deleteRange(this.cursor, target)
      } else {
        this.deleteRange(this.cursor, target)
        this.cursor = this.clamp(this.cursor)
        this.enterInsert({ line: this.cursor.line, col: this.cursor.col })
      }
    } finally {
      if (op !== 'c') this.endChange()
    }
    this.resetCmd()
    return ok(true)
  }

  private execChangeChars(n: number): PressResult {
    this.beginChange()
    const line = this.lines[this.cursor.line]
    const end = Math.min(this.cursor.col + n - 1, line.length - 1)
    try {
      this.deleteRange(this.cursor, { line: this.cursor.line, col: end })
      this.enterInsert({ line: this.cursor.line, col: this.cursor.col })
    } finally {
      if (this.mode !== 'insert') this.endChange()
    }
    this.resetCmd()
    return ok(true)
  }

  private execJoin(nRaw: number): PressResult {
    const n = Math.max(2, nRaw)
    if (this.cursor.line >= this.lines.length - 1) return ok(false)
    this.beginChange()
    try {
      const l = this.cursor.line
      const last = Math.min(l + n - 1, this.lines.length - 1)
      let joined = this.lines[l]
      let joinCol = joined.trimEnd().length
      for (let i = l + 1; i <= last; i++) {
        const lower = this.lines[i].replace(/^\s+/, '')
        if (lower === '') {
          continue
        }
        if (joined.length === 0 || /\s$/.test(joined)) {
          joined = joined + lower
        } else {
          joined = joined + ' ' + lower
        }
      }
      const next = [...this.lines.slice(0, l), joined, ...this.lines.slice(last + 1)]
      this.setLines(next)
      this.cursor = { line: l, col: Math.min(joinCol, Math.max(0, this.lines[l].length - 1)) }
    } finally {
      this.endChange()
    }
    this.resetCmd()
    return ok(true)
  }

  private execPut(before: boolean): PressResult {
    const reg = this.registers.get(this.takeRegister())
    if (!reg || reg.text.length === 0) {
      this.resetCmd()
      return { handled: false }
    }
    return this.putContent(reg, before)
  }

  /** 用给定寄存器内容粘贴（不重读寄存器——visual p 先删选区后贴，需用捕获的内容） */
  private putContent(reg: RegisterContent, before: boolean): PressResult {
    const n = this.count ?? 1
    this.beginChange()
    try {
      if (reg.blockwise) {
        this.putBlock(reg, n)
      } else if (reg.linewise) {
        const block: string[] = []
        for (let i = 0; i < n; i++) block.push(...reg.text)
        const at = before ? this.cursor.line : this.cursor.line + 1
        const next = [...this.lines.slice(0, at), ...block, ...this.lines.slice(at)]
        this.setLines(next)
        this.cursor = { line: at, col: M.firstNonBlank(this.lines[at]) }
      } else {
        const text = Array(n).fill(reg.text.join('\n')).join('\n')
        const at = before ? this.cursor.col : this.cursor.col + 1
        const line = this.lines[this.cursor.line]
        const pieces = text.split('\n')
        const first = line.slice(0, at) + pieces[0]
        const lastPiece = pieces[pieces.length - 1]
        const next = [...this.lines]
        if (pieces.length === 1) {
          next[this.cursor.line] = first + line.slice(at)
          this.setLines(next)
          this.cursor = { line: this.cursor.line, col: at + text.length - 1 }
        } else {
          next.splice(
            this.cursor.line,
            1,
            first,
            ...pieces.slice(1, -1),
            lastPiece + line.slice(at),
          )
          this.setLines(next)
          const endLine = this.cursor.line + pieces.length - 1
          this.cursor = { line: endLine, col: Math.max(0, this.lines[endLine].length - 1) }
        }
      }
    } finally {
      this.endChange()
    }
    this.resetCmd()
    return ok(true)
  }

  private putBlock(reg: RegisterContent, n: number): void {
    const col = this.cursor.col
    let next = [...this.lines]
    for (let i = 0; i < reg.text.length * n; i++) {
      const seg = reg.text[i % reg.text.length]
      const li = this.cursor.line + i
      if (li >= next.length) break
      let line = next[li]
      if (line.length < col) line = line + ' '.repeat(col - line.length)
      next[li] = line.slice(0, col) + seg + line.slice(col)
    }
    this.setLines(next)
    this.cursor = { line: this.cursor.line, col }
  }

  private execUndo(n: number): PressResult {
    this.resetCmd()
    let done = false
    for (let i = 0; i < n && this.undoStack.length; i++) {
      this.redoStack.push(this.snapshot())
      const s = this.undoStack.pop()!
      this.lines = [...s.lines]
      this.cursor = this.clamp(s.cursor)
      this.ver++
      done = true
    }
    return ok(done, done ? undefined : 'Already at oldest change')
  }

  private execRedo(n: number): PressResult {
    this.resetCmd()
    let done = false
    for (let i = 0; i < n && this.redoStack.length; i++) {
      this.undoStack.push(this.snapshot())
      const s = this.redoStack.pop()!
      this.lines = [...s.lines]
      this.cursor = this.clamp(s.cursor)
      this.ver++
      done = true
    }
    return ok(done, done ? undefined : 'Already at newest change')
  }

  private execDot(): PressResult {
    if (!this.lastChangeKeys || this.lastChangeKeys.length === 0) {
      this.resetCmd()
      return { handled: false }
    }
    let keys = [...this.lastChangeKeys]
    if (this.count != null) {
      let i = 0
      while (i < keys.length && /^[1-9]$/.test(keys[i])) i++
      if (keys[i] === '"') i += 2
      keys = [String(this.count), ...keys.slice(i)]
    }
    this.clearPending()
    this.replaying = true
    try {
      for (const k of keys) this.press(k)
    } finally {
      this.replaying = false
    }
    this.resetCmd()
    return ok(true)
  }

  // ========== insert 模式 ==========

  private pressInsert(key: Key): PressResult {
    if (key === '<Esc>') {
      const wasBlock = this.finishBlockInsert()
      if (!wasBlock && this.cursor.col > 0) this.cursor = { ...this.cursor, col: this.cursor.col - 1 }
      this.mode = 'normal'
      this.cursor = this.clamp(this.cursor)
      this.desiredCol = this.cursor.col
      if (this.changeStart != null) this.endChange()
      else this.resetCmd()
      return ok()
    }
    const line = this.lines[this.cursor.line]
    if (key === '<CR>') {
      const next = [...this.lines]
      next.splice(this.cursor.line, 1, line.slice(0, this.cursor.col), line.slice(this.cursor.col))
      this.setLines(next)
      this.cursor = { line: this.cursor.line + 1, col: 0 }
      return ok(true)
    }
    if (key === '<BS>') {
      if (this.cursor.col > 0) {
        const next = [...this.lines]
        next[this.cursor.line] = line.slice(0, this.cursor.col - 1) + line.slice(this.cursor.col)
        this.setLines(next)
        this.cursor = { ...this.cursor, col: this.cursor.col - 1 }
      } else if (this.cursor.line > 0) {
        const prev = this.lines[this.cursor.line - 1]
        const next = [...this.lines]
        next.splice(this.cursor.line - 1, 2, prev + line)
        this.setLines(next)
        this.cursor = { line: this.cursor.line - 1, col: prev.length }
      }
      return ok(true)
    }
    if (key === '<C-w>') {
      const start = this.wordStartBefore(line, this.cursor.col)
      if (start < this.cursor.col) {
        const next = [...this.lines]
        next[this.cursor.line] = line.slice(0, start) + line.slice(this.cursor.col)
        this.setLines(next)
        this.cursor = { line: this.cursor.line, col: start }
      }
      return ok(true)
    }
    if (key === '<Tab>') {
      const next = [...this.lines]
      next[this.cursor.line] = line.slice(0, this.cursor.col) + '  ' + line.slice(this.cursor.col)
      this.setLines(next)
      this.cursor = { ...this.cursor, col: this.cursor.col + 2 }
      return ok(true)
    }
    if (key.length === 1) {
      const next = [...this.lines]
      next[this.cursor.line] = line.slice(0, this.cursor.col) + key + line.slice(this.cursor.col)
      this.setLines(next)
      this.cursor = { ...this.cursor, col: this.cursor.col + 1 }
      return ok(true)
    }
    return { handled: false }
  }

  private wordStartBefore(line: string, col: number): number {
    let i = col
    while (i > 0 && line[i - 1] === ' ') i--
    const cls = i > 0 ? (/[A-Za-z0-9_]/.test(line[i - 1]) ? 'w' : 'p') : ''
    while (i > 0 && (cls === 'w' ? /[A-Za-z0-9_]/.test(line[i - 1]) : cls === 'p' && !/[A-Za-z0-9_ ]/.test(line[i - 1]))) i--
    return i
  }

  /** 块插入会话的虚显（真实 vim 输入中会把已键文本实时显示在块内各行）：
   *  返回其余各行应在 col 处叠加显示的已键文本；非块插入或尚未键入 → null */
  blockInsertPending(): { line: number; col: number; text: string }[] | null {
    const ctx = this.blockCtx
    if (!ctx) return null
    const first = this.lines[ctx.firstLine] ?? ''
    const delta = first.length - ctx.origLen
    if (delta <= 0) return null
    const typed = first.slice(ctx.col, ctx.col + delta)
    const spans: { line: number; col: number; text: string }[] = []
    for (let l = ctx.firstLine + 1; l <= ctx.lastLine; l++) {
      if (blockLineOk(this.lines[l] ?? '', ctx)) spans.push({ line: l, col: ctx.col, text: typed })
    }
    return spans
  }

  /** 块插入会话结束：把首行键入的文本套到其余行。返回是否处于块插入 */
  private finishBlockInsert(): boolean {
    const ctx = this.blockCtx
    if (!ctx) return false
    this.blockCtx = null
    const first = this.lines[ctx.firstLine] ?? ''
    const delta = first.length - ctx.origLen
    if (delta <= 0) return true
    const typed = first.slice(ctx.col, ctx.col + delta)
    const next = [...this.lines]
    for (let l = ctx.firstLine + 1; l <= ctx.lastLine; l++) {
      const line = next[l] ?? ''
      if (!blockLineOk(line, ctx)) continue
      next[l] = line.slice(0, ctx.col) + typed + line.slice(ctx.col)
    }
    this.setLines(next)
    this.cursor = { line: ctx.firstLine, col: ctx.col + delta - 1 }
    return true
  }

  // ========== visual 模式 ==========

  private pressVisual(key: Key): PressResult {
    if (this.awaitingFind) {
      const op = this.awaitingFind
      this.awaitingFind = null
      return this.execFind(op, key)
    }
    if (this.awaitingObject) {
      const inner = this.awaitingObject === 'i'
      this.awaitingObject = null
      const range = textObject(inner, key, this.lines, this.cursor)
      if (!range) return { handled: false }
      this.visualAnchor = range.start
      this.cursor = range.end
      if (range.linewise) this.mode = 'visual-line'
      return ok()
    }
    if (key >= '1' && key <= '9') {
      this.count = (this.count ?? 0) * 10 + Number(key)
      return ok()
    }
    if (key === '0' && this.count != null) {
      this.count = this.count * 10
      return ok()
    }
    if (key === '"') {
      this.awaitingRegister = true
      return ok()
    }
    if (this.awaitingRegister) {
      this.registerName = key
      this.awaitingRegister = false
      return ok()
    }
    if (this.awaitingG) {
      this.awaitingG = false
      if (key === 'g') return this.execMotion('gg')
      return { handled: false }
    }
    switch (key) {
      case '<Esc>':
        this.mode = 'normal'
        this.visualAnchor = null
        this.cursor = this.clamp(this.cursor)
        this.resetCmd()
        return ok()
      case 'v':
        this.mode = this.mode === 'visual-char' ? 'normal' : 'visual-char'
        if (this.mode === 'normal') {
          this.visualAnchor = null
          this.cursor = this.clamp(this.cursor)
        }
        return ok()
      case 'V':
        this.mode = this.mode === 'visual-line' ? 'normal' : 'visual-line'
        if (this.mode === 'normal') {
          this.visualAnchor = null
          this.cursor = this.clamp(this.cursor)
        }
        return ok()
      case '<C-v>':
        this.mode = this.mode === 'visual-block' ? 'normal' : 'visual-block'
        if (this.mode === 'normal') {
          this.visualAnchor = null
          this.cursor = this.clamp(this.cursor)
        }
        return ok()
      case 'o': {
        const a = this.visualAnchor!
        this.visualAnchor = { ...this.cursor }
        this.cursor = a
        return ok()
      }
      case 'i':
      case 'a':
        this.awaitingObject = key
        return ok()
      case 'd':
      case 'x':
        return this.execVisualOp('d')
      case 'c':
      case 's':
        return this.execVisualOp('c')
      case 'y':
        return this.execVisualOp('y')
      case '>':
        return this.execVisualOp('>')
      case '<':
        return this.execVisualOp('<')
      case 'J':
        return this.execVisualJoin()
      case 'p':
        return this.execVisualPut()
      case 'A':
        if (this.mode === 'visual-block') return this.enterBlockInsert('A')
        return { handled: false }
      case 'I':
        if (this.mode === 'visual-block') return this.enterBlockInsert('I')
        return { handled: false }
      case 'g':
        this.awaitingG = true
        return ok()
      default:
        break
    }
    // 其余按运动处理（移动光标、扩展选区）
    const motions = new Set(['h', 'l', 'j', 'k', 'w', 'b', 'e', '0', '^', '$', 'G', 'f', 'F', 't', 'T', ';', ','])
    if (motions.has(key)) {
      if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
        this.awaitingFind = key
        return ok()
      }
      return this.execMotion(key)
    }
    this.resetCmd()
    return { handled: false }
  }

  private execVisualOp(op: 'd' | 'c' | 'y' | '>' | '<'): PressResult {
    const sel = this.selectionRange()!
    const wasBlock = sel.kind === 'block'
    const wasLine = sel.kind === 'line'
    this.mode = 'normal'
    this.visualAnchor = null
    if (wasBlock) return this.execBlockOp(op, sel.start, sel.end)
    if (op === 'y') {
      if (wasLine) {
        const text = this.lines.slice(sel.start.line, sel.end.line + 1)
        this.registers.yank(this.takeRegister(), { text, linewise: true, blockwise: false })
      } else {
        if (sel.start.line === sel.end.line) {
          const text = this.lines[sel.start.line].slice(sel.start.col, sel.end.col + 1)
          this.registers.yank(this.takeRegister(), { text: [text], linewise: false, blockwise: false })
        } else {
          const text = [
            this.lines[sel.start.line].slice(sel.start.col),
            ...this.lines.slice(sel.start.line + 1, sel.end.line),
            this.lines[sel.end.line].slice(0, sel.end.col + 1),
          ]
          this.registers.yank(this.takeRegister(), { text, linewise: false, blockwise: false })
        }
      }
      this.cursor = { ...sel.start }
      this.resetCmd()
      return ok()
    }
    this.beginChange()
    try {
      if (wasLine) {
        if (op === 'c') {
          const range = this.lines.slice(sel.start.line, sel.end.line + 1)
          const next = [...this.lines.slice(0, sel.start.line), '', ...this.lines.slice(sel.end.line + 1)]
          this.setLines(next)
          this.registers.delete(this.takeRegister(), { text: range, linewise: true, blockwise: false })
          this.cursor = { line: sel.start.line, col: 0 }
          this.enterInsert({ line: sel.start.line, col: 0 })
        } else if (op === '>') {
          this.cursor = { ...this.cursor, line: sel.start.line }
          this.execLinewiseOp('>', sel.end.line - sel.start.line + 1)
        } else if (op === '<') {
          this.cursor = { ...this.cursor, line: sel.start.line }
          this.execLinewiseOp('<', sel.end.line - sel.start.line + 1)
        } else {
          const range = this.lines.slice(sel.start.line, sel.end.line + 1)
          const next = [...this.lines.slice(0, sel.start.line), ...this.lines.slice(sel.end.line + 1)]
          this.setLines(next)
          this.registers.delete(this.takeRegister(), { text: range, linewise: true, blockwise: false })
          this.cursor = { line: Math.min(sel.start.line, this.lines.length - 1), col: 0 }
          this.cursor = { line: this.cursor.line, col: M.firstNonBlank(this.lines[this.cursor.line]) }
        }
      } else {
        if (op === 'c') {
          this.deleteRange(sel.start, sel.end)
          this.cursor = this.clamp(sel.start)
          this.enterInsert({ line: this.cursor.line, col: this.cursor.col })
        } else if (op === '>') {
          this.cursor = { ...this.cursor, line: sel.start.line }
          this.execLinewiseOp('>', sel.end.line - sel.start.line + 1)
        } else if (op === '<') {
          this.cursor = { ...this.cursor, line: sel.start.line }
          this.execLinewiseOp('<', sel.end.line - sel.start.line + 1)
        } else {
          this.deleteRange(sel.start, sel.end)
        }
      }
    } finally {
      if (op !== 'c') this.endChange()
    }
    this.cursor = this.clamp(this.cursor)
    this.resetCmd()
    return ok(true)
  }

  private execBlockOp(op: 'd' | 'c' | 'y' | '>' | '<', start: Cursor, end: Cursor): PressResult {
    const l1 = start.line
    const l2 = end.line
    const c1 = start.col
    const c2 = end.col
    if (op === 'y') {
      const text: string[] = []
      for (let l = l1; l <= l2; l++) {
        const line = this.lines[l]
        text.push(line.length > c1 ? line.slice(c1, Math.min(c2 + 1, line.length)) : '')
      }
      this.registers.yank(this.takeRegister(), { text, linewise: false, blockwise: true })
      this.cursor = { line: l1, col: c1 }
      this.resetCmd()
      return ok()
    }
    if (op === '>') {
      this.cursor = { ...this.cursor, line: l1 }
      this.beginChange()
      try {
        this.execLinewiseOp('>', l2 - l1 + 1)
      } finally {
        this.endChange()
      }
      this.resetCmd()
      return ok(true)
    }
    if (op === '<') {
      this.cursor = { ...this.cursor, line: l1 }
      this.beginChange()
      try {
        this.execLinewiseOp('<', l2 - l1 + 1)
      } finally {
        this.endChange()
      }
      this.resetCmd()
      return ok(true)
    }
    // d / c：删矩形
    this.beginChange()
    try {
      const next = [...this.lines]
      for (let l = l1; l <= l2; l++) {
        const line = next[l]
        if (line.length <= c1) continue
        const cutEnd = Math.min(c2 + 1, line.length)
        next[l] = line.slice(0, c1) + line.slice(cutEnd)
      }
      const removed: string[] = []
      for (let l = l1; l <= l2; l++) {
        const line = this.lines[l]
        removed.push(line.length > c1 ? line.slice(c1, Math.min(c2 + 1, line.length)) : '')
      }
      this.setLines(next)
      this.registers.delete(this.takeRegister(), { text: removed, linewise: false, blockwise: true })
      this.cursor = { line: l1, col: Math.min(c1, Math.max(0, this.lines[l1].length)) }
      if (op === 'c') {
        this.blockCtx = { firstLine: l1, lastLine: l2, col: c1, mode: 'c', origLen: this.lines[l1].length }
        this.mode = 'insert'
        this.cursor = { line: l1, col: c1 }
        return ok(true)
      }
    } finally {
      if (op !== 'c') this.endChange()
    }
    this.cursor = this.clamp(this.cursor)
    this.resetCmd()
    return ok(true)
  }

  private enterBlockInsert(kind: 'A' | 'I'): PressResult {
    const sel = this.selectionRange()!
    const l1 = sel.start.line
    const l2 = sel.end.line
    const c1 = sel.start.col
    const c2 = sel.end.col
    const col = kind === 'A' ? c2 + 1 : c1
    // 首个足够长的行作为实时编辑行（A 需行长 > c2，I 需行长 > c1）
    let first = l1
    while (first <= l2 && this.lines[first].length <= (kind === 'A' ? c2 : c1)) first++
    if (first > l2) {
      this.mode = 'normal'
      this.visualAnchor = null
      this.resetCmd()
      return ok(false)
    }
    this.mode = 'insert'
    this.visualAnchor = null
    this.blockCtx = { firstLine: first, lastLine: l2, col, mode: kind, origLen: this.lines[first].length }
    this.beginChange()
    this.cursor = { line: first, col: Math.min(col, this.lines[first].length) }
    return ok(true)
  }

  private execVisualJoin(): PressResult {
    const sel = this.selectionRange()!
    this.mode = 'normal'
    this.visualAnchor = null
    this.cursor = { ...this.cursor, line: sel.start.line }
    return this.execJoin(sel.end.line - sel.start.line + 1)
  }

  private execVisualPut(): PressResult {
    const sel = this.selectionRange()!
    const regName = this.takeRegister()
    const reg = this.registers.get(regName)
    this.mode = 'normal'
    this.visualAnchor = null
    if (!reg || sel.kind === 'block') {
      this.resetCmd()
      return { handled: false }
    }
    if (sel.kind === 'line') {
      const range = this.lines.slice(sel.start.line, sel.end.line + 1)
      const next = [...this.lines.slice(0, sel.start.line), ...this.lines.slice(sel.end.line + 1)]
      this.setLines(next)
      this.registers.delete(regName, { text: range, linewise: true, blockwise: false })
      this.cursor = { line: Math.min(sel.start.line, this.lines.length - 1), col: 0 }
      // 以 P 语义粘贴捕获的内容（选区删除已覆盖寄存器）
      return this.putContent(reg, true)
    }
    this.beginChange()
    try {
      this.deleteRange(sel.start, sel.end)
      this.cursor = this.clamp(sel.start)
    } finally {
      this.endChange()
    }
    return this.putContent(reg, false)
  }

  // ========== cmdline / 搜索 ==========

  private pressCmdline(key: Key): PressResult {
    const cl = this.cmdline!
    if (key === '<CR>') {
      this.mode = 'normal'
      const text = cl.text
      this.cmdline = null
      if (cl.kind === 'ex') return this.execEx(text)
      return this.execSearch(cl.kind === 'search-fwd' ? 1 : -1, text)
    }
    if (key === '<Esc>') {
      this.mode = 'normal'
      this.cmdline = null
      this.resetCmd()
      return ok()
    }
    if (key === '<BS>') {
      if (cl.text.length === 0) {
        this.mode = 'normal'
        this.cmdline = null
        this.resetCmd()
        return ok()
      }
      cl.text = cl.text.slice(0, -1)
      return ok()
    }
    if (key.length === 1) {
      cl.text += key
      return ok()
    }
    return { handled: false }
  }

  private execEx(text: string): PressResult {
    this.resetCmd()
    const t = text.trim()
    if (t === '' || /^wq?a?(!)?$/.test(t) || /^q!?$/.test(t)) return ok()
    const cmd = parseSubstitute(t)
    if (!cmd) return ok(false, `Not an editor command: ${t}`)
    if (cmd.pattern === '') return ok(false, 'No previous substitute pattern')
    const targets = cmd.wholeFile ? this.lines.map((_, i) => i) : [this.cursor.line]
    let n = 0
    let lastLine = -1
    this.beginChange()
    try {
      const next = [...this.lines]
      for (const i of targets) {
        const r = substituteLine(next[i], cmd)
        if (r.n > 0) {
          next[i] = r.line
          n += r.n
          lastLine = i
        }
      }
      if (n > 0) this.setLines(next)
    } finally {
      this.endChange()
    }
    if (n === 0) return ok(false, 'Pattern not found')
    this.cursor = { line: lastLine, col: M.firstNonBlank(this.lines[lastLine]) }
    return ok(n > 0)
  }

  private execSearch(dir: 1 | -1, pattern: string): PressResult {
    this.resetCmd()
    if (pattern === '') {
      // 空模式复用上次 pattern，但方向由本次 / 或 ? 决定（真实 vim 语义）
      if (!this.lastPattern) return ok(false)
      this.lastPattern = { re: this.lastPattern.re, dir }
      return this.searchJump(dir, this.lastPattern.re)
    }
    const re = compilePattern(pattern)
    if (!re) return ok(false, 'Bad pattern')
    this.lastPattern = { re, dir }
    return this.searchJump(dir, re)
  }

  private searchJump(dir: 1 | -1, re: RegExp): PressResult {
    const hit = findNext(this.lines, this.cursor, re, dir === 1)
    if (!hit) return ok(false, 'Pattern not found')
    this.cursor = { line: hit.line, col: hit.col }
    this.desiredCol = this.cursor.col
    return ok()
  }

  private execSearchNext(logical: 1 | -1): PressResult {
    this.resetCmd()
    if (!this.lastPattern) return ok(false, 'No previous search pattern')
    // 真实 vim：n 沿上次搜索方向重复、N 反向——逻辑方向 × 历史方向
    return this.searchJump((logical * this.lastPattern.dir) as 1 | -1, this.lastPattern.re)
  }

  private execSearchWord(dir: 1 | -1): PressResult {
    this.resetCmd()
    const w = wordUnderCursorPattern(this.lines, this.cursor)
    if (!w) return ok(false, 'No word under cursor')
    const re = compilePattern(w.pattern)!
    this.lastPattern = { re, dir }
    return this.searchJump(dir, re)
  }
}
