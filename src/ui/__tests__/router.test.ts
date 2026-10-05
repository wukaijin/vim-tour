import { describe, expect, it } from 'vitest'
import { parseHash } from '../router'

describe('parseHash（hash 路由解析）', () => {
  it('空 hash 与 #/ 都是地图', () => {
    expect(parseHash('')).toEqual({ name: 'map' })
    expect(parseHash('#/')).toEqual({ name: 'map' })
  })

  it('关卡与热身', () => {
    expect(parseHash('#/level/ch1-01')).toEqual({ name: 'level', id: 'ch1-01' })
    expect(parseHash('#/warmup')).toEqual({ name: 'warmup' })
  })

  it('未知路径与非法 id 归 unknown（由桥接层拉回地图）', () => {
    expect(parseHash('#/foo')).toEqual({ name: 'unknown' })
    expect(parseHash('#/level/')).toEqual({ name: 'unknown' })
    expect(parseHash('#/level/a b')).toEqual({ name: 'unknown' })
    expect(parseHash('#/level/x/extra')).toEqual({ name: 'unknown' })
  })
})
