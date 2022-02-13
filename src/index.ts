// Copyright (c) David F. Houghton. All rights reserved. Licensed under the MIT license.

/**
 * A library for making non-backtracking regular expressions from lists of phrases.
 *
 * @remarks
 * The chief export of this library is {@link regex}. In addition there is the function
 * {@link qw}, which makes it slightly easier to make lists of phrases to give to {@link regex}.
 *
 * This library also provides polyfills for various String.prototype functions for javascript engines
 * that don't yet implement them. These are `String.prototype.repeat`, `String.prototype.includes`,
 * `String.prototype.codePointAt`, and `String.prototype.fromCodePoint`. All polyfills were borrowed from
 * {@link https://developer.mozilla.org|MDN}.
 *
 * Some regular expression features, in particular {@link https://caniuse.com/js-regexp-lookbehind|lookbehinds}, and
 * {@link https://caniuse.com/mdn-javascript_builtins_regexp_property_escapes|property escapes}, are used to
 * discover word boundaries in strings with code points above the ASCII range. These cannot be polyfilled,
 * so marking word boundaries will not work on certain browsers.
 *
 * @packageDocumentation
 */

/**
 * Options you can pass to {@link regex}.
 *
 * @export
 * @typedef {ListMatcherOptions}
 */
export type ListMatcherOptions = {
  bound?: boolean
  capture?: boolean
  normalizeWhitespace?: boolean
  flags?: string
  substitutions?: Record<string, string>
}

/**
 * Generates a regular expression matching a list of strings.
 *
 * @example
 * ```ts
 * regex(qw('cat camel coulomb dog e f g h i'))
 * => /(?:c(?:a(?:mel|t)|oulomb)|dog|[e-i])/
 *
 * // telephone numbers
 * regex(['+## #### ######b', 'b###-####b', '(###) ###-####b'],{substitutions: {'b': '\\b', '#': '\\d'}})
 * => /(?:\(\d{3}\) \d{3}-|\+\d\d \d{4} \d\d|\b\d{3}-)\d{4}\b/
 * ```
 *
 * @param {string[]} words - phrases to match
 * @param {ListMatcherOptions} [opts={}] - flags and directives for how to construct the expression
 * @returns {RegExp} regular expression matching `words`
 */
export function regex(words: string[], opts: ListMatcherOptions = {}): RegExp {
  words = [...words]
  const options = adjustOptions(words, opts)
  const slices = toSlices(words, options)
  let rx = condense(slices, options)
  if (options.capture) rx = `(${rx})`
  return new RegExp(rx, flags(options))
}

/**
 * Turns a string into an array of non-empty strings.
 *
 * @param {string} s - the string to split
 * @param {(string | RegExp)} [splitter=/\s+/] - the expression used to split `s`
 * @returns {string[]} the non-empty pieces of `s` after splitting
 */
export function qw(s: string, splitter: string | RegExp = /\s+/): string[] {
  return s.split(splitter).filter((p) => p)
}

type Opts = {
  bound: boolean
  capture: boolean
  normalizeWhitespace: boolean
  subtitutions?: Record<number, string>
  global: boolean
  caseInsensitive: boolean
  unicode: boolean
  sticky: boolean
  multiline: boolean
  dotall: boolean
}

// the block from -1 to -127 is reserved for special substitutions like this
const SPECIAL_CODE_POINTS = {
  whiteSpace: -1,
  asciiBoundary: -2,
  unicodeLeftBoundary: -3,
  unicodeRightBoundary: -4,
} as const

const CHAR_CLASS_META = '-\\]^'.split('').map((c) => c.codePointAt(0))
const META = '^$+*?.|()[{\\'.split('').map((c) => c.codePointAt(0))

type Slice = {
  codePoints: number[]
  start: number
  end: number
}

// convert options back into the flags that RegExp supports
function flags(options: Opts): string {
  const ar = []
  if (options.global) ar.push('g')
  if (options.caseInsensitive) ar.push('i')
  if (options.multiline) ar.push('m')
  if (options.dotall) ar.push('s')
  if (options.unicode) ar.push('u')
  if (options.sticky) ar.push('y')
  return ar.join('')
}

// adjust options to those relevant to internal operations
// normalize words by deduping, normalizing case, etc.
function adjustOptions(words: string[], opts: ListMatcherOptions): Opts {
  const flags = opts.flags || ''
  const options: Opts = {
    bound: !!opts.bound,
    capture: !!opts.capture,
    normalizeWhitespace: !!opts.normalizeWhitespace,
    global: flags.includes('g'),
    caseInsensitive: flags.includes('i'),
    unicode: flags.includes('u'),
    multiline: flags.includes('m'),
    dotall: flags.includes('s'),
    sticky: flags.includes('y'),
  }
  const doSubstitutions = prepareSubstitutions(opts, options, words)
  const ignore = options.subtitutions ? Object.keys(options.subtitutions).map((s) => Number(s)) : []
  const seen = new Set()
  const newWords: string[] = []
  for (let i = 0; i < words.length; i++) {
    let w = doSubstitutions(words[i])
    if (seen.has(w)) continue
    seen.add(w)
    if (w.length === 0) continue
    if (!options.unicode) {
      for (let j = 0; j < w.length; j++) {
        const c = w.codePointAt(j)
        if (c && ignore.includes(c)) continue
        if (c === undefined || c > 127) {
          options.unicode = true
          break
        }
      }
    }
    if (options.normalizeWhitespace) {
      let w2 = w.trim().replace(/\s+/g, ' ')
      if (w2.length === 0) continue
      if (w2 !== w) {
        if (seen.has(w2)) continue
        seen.add(w2)
        w = w2
      }
    }
    if (options.caseInsensitive) {
      let w2 = w.toLowerCase()
      if (w2 !== w) {
        if (seen.has(w2)) continue
        seen.add(w2)
        w = w2
      }
    }
    newWords.push(w)
  }
  // so the same set of words, however ordered, always produces the same regex for a given set of options
  newWords.sort()
  words.length = 0
  words.unshift(...newWords)
  return options
}

function condense(slices: Slice[], opts: Opts): string {
  if (slices.length === 0) return '(?!)'
  const [slcs1, prefix] = extractPrefix(slices, opts)
  // if this was everything, just return the prefix
  if (slcs1.length === 1 && sliceLength(slcs1[0]) === 0) return prefix
  const [slcs2, suffix] = extractSuffix(slcs1, opts)
  const slcs3 = slcs2.filter((sl) => sliceLength(sl))
  const anyOptional = slcs3.length < slices.length ? '?' : ''
  // separate single characters and sequences
  const chars: Slice[] = []
  const sequences: Slice[] = []
  for (const sl of slcs3) {
    ;(sliceLength(sl) === 1 ? chars : sequences).push(sl)
  }
  let middle
  if (sequences.length) {
    const parts = groupByFirst(sequences).map((slcs) => condense(slcs, opts))
    parts.sort()
    if (chars.length)
      parts.push(
        charClass(
          chars.map((sl) => firstChar(sl)!),
          true,
          opts,
        ),
      )
    middle = `(?:${parts.join('|')})`
  } else {
    // if we've gotten here we necessarily have some chars
    middle = charClass(
      chars.map((sl) => firstChar(sl)!),
      false,
      opts,
    )
  }
  return `${prefix}${middle}${anyOptional}${suffix}`
}

// groups slices by first character
function groupByFirst(slices: Slice[]): Slice[][] {
  const groups: Record<string, Slice[]> = {}
  for (const sl of slices) {
    const ar = (groups[firstChar(sl)!] ??= [])
    ar.push(sl)
  }
  return Object.values(groups)
}

// extracts common prefix of all slices, if any
function extractPrefix(slices: Slice[], options: Opts): [Slice[], string] {
  if (slices.length === 1) {
    const sl = slices[0]
    const prefix = sl.codePoints.slice(sl.start, sl.end)
    sl.start = sl.end
    return [[sl], reduceDuplicates(prefix, options)]
  }
  let c = firstChar(slices[0])
  const prefix = []
  outer: while (c) {
    for (const sl of slices) {
      if (sliceLength(sl) === 0) break outer
      if (firstChar(sl) !== c) break outer
    }
    for (const sl of slices) sl.start++
    prefix.push(c)
    c = firstChar(slices[0])
  }
  return [slices, reduceDuplicates(prefix, options)]
}

// extracts common suffix of all slices, if any
function extractSuffix(slices: Slice[], options: Opts): [Slice[], string] {
  if (slices.length === 1) {
    const sl = slices[0]
    const suffix = sl.codePoints.slice(sl.start, sl.end)
    sl.start = sl.end
    return [[sl], reduceDuplicates(suffix, options)]
  }
  let c = lastChar(slices[0])
  const suffix = []
  outer: while (c) {
    for (const sl of slices) {
      if (sliceLength(sl) === 0) break outer
      if (lastChar(sl) !== c) break outer
    }
    for (const sl of slices) sl.end--
    suffix.push(c)
    c = lastChar(slices[0])
  }
  return [slices, reduceDuplicates(suffix.reverse(), options)]
}

// look for repeating characters and maybe use a repetition count -- a{5}, e.g.
function reduceDuplicates(sequence: number[], options: Opts): string {
  if (sequence.length === 0) return ''
  let dupCount = 1
  let unit = sequence[0]
  let reduced = ''
  for (let i = 1; i < sequence.length; i++) {
    const p = sequence[i]
    if (p === unit) {
      dupCount += 1
    } else {
      reduced += maybeReduce(dupCount, toAtom(unit, false, options))
      unit = p
      dupCount = 1
    }
  }
  reduced += maybeReduce(dupCount, toAtom(unit, false, options))
  return reduced
}

// converts aaaaa into a{5}, etc.
// cannot return a pattern longer than the input sequence
function maybeReduce(dc: number, unit: string): string {
  return dc === 1 ? unit : dc * unit.length > unit.length + 3 ? `${unit}{${dc}}` : unit.repeat(dc)
}

function firstChar(slice: Slice): number | undefined {
  return sliceLength(slice) > 0 ? slice.codePoints[slice.start] : undefined
}

function lastChar(slice: Slice): number | undefined {
  return sliceLength(slice) > 0 ? slice.codePoints[slice.end - 1] : undefined
}

function sliceLength(slice: Slice) {
  return slice.end - slice.start
}

function prepareSubstitutions(opts: ListMatcherOptions, options: Opts, words: string[]): (w: string) => string {
  if (!opts.substitutions) return (w) => w
  const count = Object.keys(opts.substitutions).length
  if (count) {
    const unused = getUnusedCharacters(count, words)
    const substitutions: Record<number, string> = {}
    const replacementHash: Record<string, string> = {}
    for (const [from, to] of Object.entries(opts.substitutions)) {
      const [cp, char] = unused.shift()!
      replacementHash[from] = char
      substitutions[cp] = to
    }
    options.subtitutions = substitutions
    const rx = regex(Object.keys(opts.substitutions), { flags: 'g' })
    return (w) => w.replace(rx, (s) => replacementHash[s]!)
  } else {
    return (w) => w
  }
}

// get characters and codepoints that can be used for substitution
function getUnusedCharacters(count: number, words: string[]): [number, string][] {
  if (count === 0) return []
  const found: (undefined | boolean)[] = []
  for (const w of words) {
    for (let i = 0; i < w.length; i++) {
      const n = w.codePointAt(i)
      if (n !== undefined) found[n] = true
    }
  }
  const unused: [number, string][] = []
  let i = 128 // skip ascii to avoid metacharacters and common characters
  while (unused.length < count) {
    if (!found[i]) {
      const c = String.fromCodePoint(i)
      if (c.toLowerCase() === c && !/\s/.test(c)) unused.push([i, c])
    }
    i++
  }
  return unused
}

// converts remaining characters to "codepoints" (real codepoints and special negative ones)
// adds boundaries
// fixes substitution map so its keys are negative
function toSlices(words: string[], options: Opts): Slice[] {
  const substitutionCodepoints = Object.keys(options.subtitutions || {}).map((n) => Number(n))
  const slices = words.map((w) => {
    // to accelerate other code, we store subtitution codepoints as negative numbers
    let codePoints = w
      .split('')
      .map((c) => c.codePointAt(0) || 0)
      .map((c) => (substitutionCodepoints.includes(c) ? -c : c))
    if (options.normalizeWhitespace) codePoints = codePoints.map((c) => (c === 32 ? SPECIAL_CODE_POINTS.whiteSpace : c))
    if (options.bound) {
      if (options.unicode) {
        if (codePoints[0] > 0 && /^[\p{L}\p{N}_]/u.test(w)) codePoints.unshift(SPECIAL_CODE_POINTS.unicodeLeftBoundary)
        if (codePoints[codePoints.length - 1] > 0 && /[\p{L}\p{N}_]$/u.test(w))
          codePoints.push(SPECIAL_CODE_POINTS.unicodeRightBoundary)
      } else {
        if (codePoints[0] > 0 && /^\w/.test(w)) codePoints.unshift(SPECIAL_CODE_POINTS.asciiBoundary)
        if (codePoints[codePoints.length - 1] > 0 && /\w$/.test(w)) codePoints.push(SPECIAL_CODE_POINTS.asciiBoundary)
      }
    }
    return { codePoints, start: 0, end: codePoints.length }
  })
  if (options.subtitutions) {
    Object.entries(options.subtitutions).forEach(([k, v]) => {
      options.subtitutions![-Number(k)] = v
      delete options.subtitutions![Number(k)]
    })
  }
  return slices
}

// take a collection of code points and try to make a character class expressions
// this might be impossible -- some things represented as code points are actually more complex
// if we cannot make a character class, it is useful to know whether this sub-expression is to be embedded in a list of alternates
function charClass(codePoints: number[], embedded: boolean, opts: Opts): string {
  codePoints.sort((a, b) => a - b)
  if (codePoints[0] < 0) {
    // some of these things can't go in a character class
    const problems = []
    while (codePoints.length) {
      if (codePoints[0] >= 0) break
      problems.push(codePoints.shift()!)
    }
    const parts = problems.map((c) => toAtom(c, false, opts))
    if (codePoints.length > 1) {
      const cc = safeCharClass(codePoints, opts)
      if (cc.length < codePoints.length * 2 - 1) {
        parts.push(cc)
      } else {
        parts.unshift(...codePoints.map((c) => toAtom(c, false)))
      }
    } else {
      parts.unshift(...codePoints.map((c) => toAtom(c, false)))
    }
    const middle = parts.join('|')
    return embedded ? middle : `(?:${middle})`
  } else {
    return safeCharClass(codePoints, opts)
  }
}

// make a character class expression
// at this point the code points should be filtered to just those that can live in a character class
function safeCharClass(codePoints: number[], opts: Opts): string {
  if (codePoints.length === 1) return toAtom(codePoints[0], false)
  let skipping = false
  let start = null
  let current = -2
  let chars = ''
  for (const n of codePoints) {
    if (n == current + 1) {
      skipping = true
    } else {
      if (skipping) {
        if (current > start! + 1) chars += '-'
        chars += toAtom(current, true)
      }
      start = n
      chars += toAtom(start, true)
      skipping = false
    }
    current = n
  }
  if (skipping) {
    if (current > start! + 1) chars += '-'
    chars += toAtom(current, true)
  }
  // condense a few of the more common character classes
  // we might extend this list in the future
  if (opts.caseInsensitive) {
    chars = chars.replace(/0-9(.*)_(.*)a-z/, '\\w$1$2')
  } else {
    chars = chars.replace(/0-9(.*)A-Z(.*)_(.*)a-z/, '\\w$1$2$3')
  }
  chars = chars.replace('0-9', '\\d')
  return /^\\\w$/.test(chars) ? chars : `[${chars}]`
}

// convert a code point back into a fragment of a regular expression
function toAtom(codePoint: number, inCharClass: boolean, options?: Opts): string {
  if (codePoint < 0 && codePoint > -127) {
    // substitutions are < -127
    switch (codePoint) {
      case SPECIAL_CODE_POINTS.asciiBoundary:
        return '\\b'
      case SPECIAL_CODE_POINTS.unicodeLeftBoundary:
        return '(?<![\\p{L}\\p{N}_])'
      case SPECIAL_CODE_POINTS.unicodeRightBoundary:
        return '(?![\\p{L}\\p{N}_])'
      case SPECIAL_CODE_POINTS.whiteSpace:
        return '\\s+'
      default:
        throw new Error(`unexpected code point: ${codePoint}`)
    }
  } else {
    if (options?.subtitutions) {
      const rx = options.subtitutions[codePoint]
      if (rx !== undefined) return rx
    }
    return quotemeta(codePoint, inCharClass)
  }
}

// escape regular expression meta-characters as necessary given the context
// character classes have different meta-characters
function quotemeta(codePoint: number, inCharClass: boolean): string {
  if (codePoint === 9) return '\\t'
  if (codePoint === 10) return '\\n'
  if (codePoint === 12) return '\\f'
  if (codePoint === 13) return '\\r'
  const escape = (inCharClass ? CHAR_CLASS_META : META).includes(codePoint)
  const c = String.fromCodePoint(codePoint)
  return escape ? '\\' + c : c
}

/**
 * Patch IE to provide String.prototype.repeat, String.prototype.includes, String.codePointAt, and String.fromCodePoint
 */

/*! https://mths.be/codepointat v0.2.0 by @mathias */
// @ts-ignore
if (!String.prototype.codePointAt) {
  ;(function () {
    'use strict' // needed to support `apply`/`call` with `undefined`/`null`
    var defineProperty = (function () {
      // IE 8 only supports `Object.defineProperty` on DOM elements
      try {
        var object = {}
        var $defineProperty = Object.defineProperty
        // @ts-ignore
        var result = $defineProperty(object, object, object) && $defineProperty
      } catch (error) {}
      // @ts-ignore
      return result
    })()
    // @ts-ignore
    var codePointAt = function (position) {
      // @ts-ignore
      if (this == null) {
        throw TypeError()
      }
      // @ts-ignore
      var string = String(this)
      var size = string.length
      // `ToInteger`
      var index = position ? Number(position) : 0
      if (index != index) {
        // better `isNaN`
        index = 0
      }
      // Account for out-of-bounds indices:
      if (index < 0 || index >= size) {
        return undefined
      }
      // Get the first code unit
      var first = string.charCodeAt(index)
      var second
      if (
        // check if it’s the start of a surrogate pair
        first >= 0xd800 &&
        first <= 0xdbff && // high surrogate
        size > index + 1 // there is a next code unit
      ) {
        second = string.charCodeAt(index + 1)
        if (second >= 0xdc00 && second <= 0xdfff) {
          // low surrogate
          // https://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
          return (first - 0xd800) * 0x400 + second - 0xdc00 + 0x10000
        }
      }
      return first
    }
    if (defineProperty) {
      defineProperty(String.prototype, 'codePointAt', {
        value: codePointAt,
        configurable: true,
        writable: true,
      })
    } else {
      String.prototype.codePointAt = codePointAt
    }
  })()
}

/*! https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/fromCodePoint */
if (!String.fromCodePoint) {
  ;(function (stringFromCharCode) {
    // @ts-ignore
    var fromCodePoint = function (_) {
      var codeUnits = [],
        codeLen = 0,
        result = ''
      for (var index = 0, len = arguments.length; index !== len; ++index) {
        var codePoint = +arguments[index]
        // correctly handles all cases including `NaN`, `-Infinity`, `+Infinity`
        // The surrounding `!(...)` is required to correctly handle `NaN` cases
        // The (codePoint>>>0) === codePoint clause handles decimals and negatives
        if (!(codePoint < 0x10ffff && codePoint >>> 0 === codePoint))
          throw RangeError('Invalid code point: ' + codePoint)
        if (codePoint <= 0xffff) {
          // BMP code point
          codeLen = codeUnits.push(codePoint)
        } else {
          // Astral code point; split in surrogate halves
          // https://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
          codePoint -= 0x10000
          codeLen = codeUnits.push(
            (codePoint >> 10) + 0xd800, // highSurrogate
            (codePoint % 0x400) + 0xdc00, // lowSurrogate
          )
        }
        if (codeLen >= 0x3fff) {
          result += stringFromCharCode.apply(null, codeUnits)
          codeUnits.length = 0
        }
      }
      return result + stringFromCharCode.apply(null, codeUnits)
    }
    try {
      // IE 8 only supports `Object.defineProperty` on DOM elements
      Object.defineProperty(String, 'fromCodePoint', {
        value: fromCodePoint,
        configurable: true,
        writable: true,
      })
    } catch (e) {
      String.fromCodePoint = fromCodePoint
    }
  })(String.fromCharCode)
}

/*! https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes */
if (!String.prototype.includes) {
  String.prototype.includes = function (search, start) {
    'use strict'

    // @ts-ignore
    if (search instanceof RegExp) {
      throw TypeError('first argument must not be a RegExp')
    }
    if (start === undefined) {
      start = 0
    }
    return this.indexOf(search, start) !== -1
  }
}

/*! https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat */
if (!String.prototype.repeat) {
  String.prototype.repeat = function (count) {
    'use strict'
    if (this == null) throw new TypeError("can't convert " + this + ' to object')

    var str = '' + this
    // To convert string to integer.
    count = +count
    // Check NaN
    if (count != count) count = 0

    if (count < 0) throw new RangeError('repeat count must be non-negative')

    if (count == Infinity) throw new RangeError('repeat count must be less than infinity')

    count = Math.floor(count)
    if (str.length == 0 || count == 0) return ''

    // Ensuring count is a 31-bit integer allows us to heavily optimize the
    // main part. But anyway, most current (August 2014) browsers can't handle
    // strings 1 << 28 chars or longer, so:
    if (str.length * count >= 1 << 28) throw new RangeError('repeat count must not overflow maximum string size')

    var maxCount = str.length * count
    count = Math.floor(Math.log(count) / Math.log(2))
    while (count) {
      str += str
      count--
    }
    str += str.substring(0, maxCount - str.length)
    return str
  }
}
