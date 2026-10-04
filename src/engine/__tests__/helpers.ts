import { VimEngine } from '../engine'
import type { Cursor } from '../types'

export const TEXT = ['foo bar baz', 'qux quux corge', 'grault garply waldo']

export function run(lines: string[], keys: string, cursor?: Cursor) {
  const e = new VimEngine({ lines, cursor })
  e.pressAll(keys)
  return { lines: e.lines, cursor: e.cursor, mode: e.mode, engine: e }
}
