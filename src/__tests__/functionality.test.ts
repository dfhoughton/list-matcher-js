import { ListMatcherOptions, qw, regex } from '../index'

describe('qw', () => {
  test('basic qw', () => expect(qw('foo bar')).toEqual(['foo', 'bar']))
  test('extra space qw', () => expect(qw(' foo  bar  ')).toEqual(['foo', 'bar']))
  test('empty string splitter', () => expect(qw('foo bar', '')).toEqual(['f', 'o', 'o', ' ', 'b', 'a', 'r']))
})

// regex tests

describe('regex', () => {
  type Test = {
    words: string[]
    options?: ListMatcherOptions
    pattern?: string
    duds?: string[]
    label?: string
    suffix?: string
  }
  describe('basic', () => {
    const chars = 'abcdefjhijklmnopqrstuvwxyzåß∑≈ç√ƒπµ†0123456789!@#$%^&*()_+-=:;'
    const rand = (n: number): number => Math.floor(Math.random() * n)
    function randomWord(max = 8): string {
      let word = ''
      for (let i = 0, l = rand(8) + 1; i < l; i++) word += chars.charAt(rand(chars.length))
      return word
    }
    function randomList(n: number, max = 8): string[] {
      const list = []
      for (let i = 0; i < n; i++) list.push(randomWord(max))
      return list
    }
    const tests: Test[] = [
      { words: ['cat'], pattern: 'cat', suffix: '' },
      { label: 'deduping', words: ['cat', 'cat'], pattern: 'cat', suffix: '' },
      {
        label: 'case-insensitive deduping',
        words: qw('cat Cat cAt CAt caT CaT cAT CAT'),
        pattern: 'cat',
        suffix: 'i',
        options: { flags: 'i' },
      },
      { words: ['fooooo'], pattern: 'fo{5}' },
      { words: ['cat foo'], pattern: 'cat\\s+foo', options: { normalizeWhitespace: true } },
      { label: 'whitespace escapes', words: qw(' \v\r\t\n\f', ''), pattern: '[\\t-\\r ]' },
      { label: 'whitespace escapes: vertical', words: qw(' \v', ''), pattern: '[\\v ]' },
      { label: 'whitespace escapes: carriage return', words: qw(' \r', ''), pattern: '[\\r ]' },
      { label: 'whitespace escapes: tab', words: qw(' \t', ''), pattern: '[\\t ]' },
      { label: 'whitespace escapes: newline', words: qw(' \n', ''), pattern: '[\\n ]' },
      { label: 'whitespace escapes: form feed', words: qw(' \f', ''), pattern: '[\\f ]' },
      { label: 'empty pattern', words: [], pattern: '(?!)' },
      {
        words: qw('cat cats'),
        pattern: 'cats?',
      },
      {
        words: qw('cat bat'),
        pattern: '[bc]at',
      },
      {
        words: qw('CAT BAT'),
        pattern: '[bc]at',
        suffix: 'i',
        options: { flags: 'i' },
      },
      {
        words: qw('scats shits'),
        pattern: 's(?:ca|hi)ts',
      },
      {
        words: qw('cat dog camel'),
        duds: qw('scat cattle hotdog doggerel cameleopard'),
        options: { bound: true },
      },
      { label: 'metacharacters', words: qw('@#!#$ ()\\%%^& ./~@+-_') },
      { label: 'detect unicode', words: ['süß'], suffix: 'u' },
      {
        label: 'bounded unicode',
        words: qw('süß ystävä olé'),
        duds: qw('süßer ystävällinen'),
        options: { bound: true },
      },
      { label: 'finds numbers', words: qw('0123456789', ''), pattern: '\\d' },
      {
        label: 'finds word chars',
        words: (() => {
          const words = []
          for (let i = 0; i < 255; i++) {
            const c = String.fromCodePoint(i)
            if (/\w/.test(c)) words.push(c)
          }
          return words
        })(),
        pattern: '\\w',
      },
      {
        label: 'finds word chars, case insensitive',
        words: (() => {
          const words = []
          for (let i = 0; i < 255; i++) {
            const c = String.fromCodePoint(i)
            if (/\w/.test(c)) words.push(c.toLowerCase())
          }
          return words
        })(),
        options: { flags: 'i' },
        pattern: '\\w',
      },
      { label: 'regression *, #', words: qw('* #') },
      { label: 'long list', words: randomList(200) },
      { label: 'long list short words', words: randomList(200, 4) },
      { label: 'long list long words', words: randomList(200, 16) },
    ]
    tests.forEach(({ words, pattern, duds, label, options, suffix }) => {
      const rx = regex(words, options)
      label ??= words.join(', ').slice(0, 32)
      if (pattern) test(label, () => expect(rx.source).toBe(pattern))
      if (suffix) test(`suffix for ${label}`, () => expect(rx.flags).toBe(suffix))
      for (const w of words) {
        test(`${label}: ${w} =~ ${rx}`.slice(0, 64), () => expect(rx.test(w)).toBeTruthy())
      }
      if (duds) {
        for (const w of duds) {
          test(`${label}: ${w} !~ ${rx}`.slice(0, 64), () => expect(rx.test(w)).toBeFalsy())
        }
      }
    })
  })

  describe('random bits', () => {
    const rx = regex([''])
    test('empty strings are ignored', () => expect(rx.source).toBe('(?!)'))
    test('regex works', () => expect('' + regex([])).toBe('/(?!)/'))
  })

  describe('substitutions', () => {
    type SubstitutionTest = Test & {
      testWords: string[]
      substitutions: Record<string, string>
    }

    const substitutionTests: SubstitutionTest[] = [
      {
        label: 'basic',
        words: ['###-####'],
        pattern: '\\d{3}-\\d{4}',
        testWords: ['123-4567'],
        substitutions: { '#': '\\d' },
      },
      {
        label: 'overlapping',
        words: ['n-new', 'new-n'],
        pattern: '(?:\\d-\\w|\\w-\\d)',
        testWords: ['1-a', 'a-1'],
        substitutions: { n: '\\d', new: '\\w' },
      },
      {
        label: 'complex',
        words: ['b###-####b', '(###) ###-####b', 'b###-###-####b'],
        pattern: '(?:\\(\\d{3}\\) |\\b\\d{3}-|\\b)\\d{3}-\\d{4}\\b',
        testWords: ['123-4567', '(802) 123-4567', '802-123-4567'],
        duds: ['0123-4567', '123-45670', '(802) 123-45670', '802-123-45670'],
        substitutions: { '#': '\\d', b: '\\b' },
      },
      {
        label: 'null character and soh as substitution',
        words: ['\x01\0\0\0-\0\0\0\0\x01', '(\0\0\0) \0\0\0-\0\0\0\0\x01', '\x01\0\0\0-\0\0\0-\0\0\0\0\x01'],
        pattern: '(?:\\(\\d{3}\\) |\\b\\d{3}-|\\b)\\d{3}-\\d{4}\\b',
        testWords: ['123-4567', '(802) 123-4567', '802-123-4567'],
        duds: ['0123-4567', '123-45670', '(802) 123-45670', '802-123-45670'],
        substitutions: { '\0': '\\d', '\x01': '\\b' },
      },
    ]

    substitutionTests.forEach(({ words, pattern, duds, label, options, suffix, testWords, substitutions }) => {
      options ??= {}
      options.substitutions = substitutions
      const rx = regex(words, options)
      label ??= words.join(', ').slice(0, 32)
      if (pattern) test(label, () => expect(rx.source).toBe(pattern))
      if (suffix) test(`suffix for ${label}`, () => expect(rx.flags).toBe(suffix))
      for (const w of testWords) {
        test(`${label}: ${w} =~ ${rx}`.slice(0, 64), () => expect(rx.test(w)).toBeTruthy())
      }
      if (duds) {
        for (const w of duds) {
          test(`${label}: ${w} !~ ${rx}`.slice(0, 64), () => expect(rx.test(w)).toBeFalsy())
        }
      }
    })
  })

  describe('unicode and surrogate pairs', () => {
    test('emoji (surrogate pairs) are handled correctly', () => {
      const rx = regex(['😀', '😁', '😂'])
      expect(rx.test('😀')).toBe(true)
      expect(rx.test('😁')).toBe(true)
      expect(rx.test('😂')).toBe(true)
      expect(rx.test('🤔')).toBe(false)
      expect(rx.flags).toContain('u')
    })

    test('supplementary plane characters (Deseret) are handled correctly', () => {
      const rx = regex(['𐐷', '𐐸', '𐐹'])
      expect(rx.test('𐐷')).toBe(true)
      expect(rx.test('𐐸')).toBe(true)
      expect(rx.test('𐐹')).toBe(true)
      expect(rx.test('𐐺')).toBe(false)
      expect(rx.flags).toContain('u')
    })

    test('mixed ASCII and emoji', () => {
      const rx = regex(['cat', '😀', 'dog'])
      expect(rx.test('cat')).toBe(true)
      expect(rx.test('😀')).toBe(true)
      expect(rx.test('dog')).toBe(true)
      expect(rx.test('bird')).toBe(false)
      expect(rx.flags).toContain('u')
    })

    test('unicode flag is set for non-ASCII substitution values', () => {
      const rx = regex(['#'], { substitutions: { '#': '€' } })
      expect(rx.source).toContain('€')
      expect(rx.test('€')).toBe(true)
      expect(rx.flags).toContain('u')
    })

    test('unicode flag is set for non-ASCII in substitution values (complex)', () => {
      const rx = regex(['##'], { substitutions: { '#': '€' } })
      expect(rx.test('€€')).toBe(true)
      expect(rx.flags).toContain('u')
    })

    test('non-ASCII characters in words trigger unicode flag', () => {
      const rx = regex(['café'])
      expect(rx.test('café')).toBe(true)
      expect(rx.flags).toContain('u')
    })

    test('control characters are escaped as hex', () => {
      const soh = String.fromCharCode(1)
      const bel = String.fromCharCode(7)
      const rx = regex([soh, bel])
      expect(rx.source).toContain('\\x01')
      expect(rx.source).toContain('\\x07')
      expect(rx.test(soh)).toBe(true)
      expect(rx.test(bel)).toBe(true)
    })

    test('all control characters (0-31) are handled correctly', () => {
      const controlChars = []
      for (let i = 0; i <= 31; i++) {
        controlChars.push(String.fromCharCode(i))
      }
      const rx = regex(controlChars)
      for (let i = 0; i <= 31; i++) {
        expect(rx.test(String.fromCharCode(i))).toBe(true)
      }
      // Control characters may be represented as a range or individually
      // The important thing is that they all match correctly
      expect(rx.source.length > 0).toBe(true)
    })

    test('zero-width characters are handled', () => {
      const zwsp = '\u200b' // zero-width space
      const zwj = '\u200d' // zero-width joiner
      const zwnj = '\u200c' // zero-width non-joiner
      const rx = regex([zwsp, zwj, zwnj])
      expect(rx.test(zwsp)).toBe(true)
      expect(rx.test(zwj)).toBe(true)
      expect(rx.test(zwnj)).toBe(true)
      expect(rx.flags).toContain('u')
    })

    test('combined unicode characters (NFC vs NFD)', () => {
      // é can be U+00E9 (single) or U+0065 + U+0301 (e + combining acute)
      const single = '\u00e9'
      const combined = 'e\u0301'
      const rx = regex([single, combined])
      expect(rx.test(single)).toBe(true)
      expect(rx.test(combined)).toBe(true)
      expect(rx.flags).toContain('u')
    })
  })
})
