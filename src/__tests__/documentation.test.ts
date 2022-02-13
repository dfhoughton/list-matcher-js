/** tests for all the code shown in documentation */

import { ListMatcherOptions, qw, regex } from '../index'

describe('README', () => {
  describe('Synopsis', () => {
    test('qw is a convenience function for creating arrays of strings 1', () =>
      expect(qw("these are the times that try men's souls")).toEqual([
        'these',
        'are',
        'the',
        'times',
        'that',
        'try',
        "men's",
        'souls',
      ]))
    test('qw is a convenience function for creating arrays of strings 2', () =>
      expect(qw('abcdefg', '')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']))

    test('minimal case', () => expect(regex(['cat'])).toEqual(/cat/))

    test('case-insensitive', () => expect(regex(['CAT'], { flags: 'i' })).toEqual(/cat/i))

    test('more interesting', () =>
      expect(regex(qw('cat camel coulomb dog e f g h i'))).toEqual(/(?:c(?:a(?:mel|t)|oulomb)|dog|[e-i])/))

    test('it finds simple character classes!', () => expect(regex(qw('0123456789', ''))).toEqual(/\d/))

    test('it can express character classes as ranges', () =>
      expect(regex(qw('abcdefghijklmnopqrstuvwxyz_0123456789', ''))).toEqual(/[0-9_a-z]/))

    test("let's make this case-insensitive!", () =>
      expect(regex(qw('abcdefghijklmnopqrstuvwxyz_0123456789', ''), { flags: 'i' })).toEqual(/\w/i))

    test('non-ascii!', () => expect(regex(qw('süß bloß'))).toEqual(/(?:blo|sü)ß/u))

    test('find word boundaries for me and do something smart with whitespace', () =>
      expect(regex(['  cat  ', 'cat', 'cat or dog', '!@##$%^&*'], { bound: true, normalizeWhitespace: true })).toEqual(
        /(?:!@##\$%\^&\*|\bcat(?:\s+or\s+dog)?\b)/,
      ))

    test('what becomes of common whitespace characters?', () => expect(regex(qw('\t\r\n\f', ''))).toEqual(/[\t\n\f\r]/))

    test('what do you get with an empty array?', () => expect(regex([])).toEqual(/(?!)/))

    test('how about empty strings?', () => expect(regex([''])).toEqual(/(?!)/))

    test('word boundaries in non-ascii strings?', () =>
      expect(regex(qw('süß bloß'), { bound: true })).toEqual(/(?<![\p{L}\p{N}_])(?:blo|sü)ß(?![\p{L}\p{N}_])/u))

    let splitter = regex(qw('cat dog bird'), { capture: true })
    test('what if I want to make an expression for splitting strings and keeping the boundary bits? 1', () =>
      expect(splitter).toEqual(/((?:bird|cat|dog))/))
    test('what if I want to make an expression for splitting strings and keeping the boundary bits? 2', () =>
      expect('the cat saw a birddog'.split(splitter)).toEqual(['the ', 'cat', ' saw a ', 'bird', '', 'dog', '']))

    let telephoneNumbers = ['b###-####b', '(###) ###-####b', 'b###-###-####b', '+#-###-###-####b', '+## #### ######b']
    test('and can we use this to combine patterns?', () =>
      expect(regex(telephoneNumbers, { substitutions: { '#': '\\d', b: '\\b' } })).toEqual(
        /(?:\(\d{3}\) \d{3}-|\+\d(?:-\d{3}-\d{3}-|\d \d{4} \d\d)|\b\d{3}-(?:\d{3}-)?)\d{4}\b/,
      ))

    test("NOTE: you don't need to use single-character identifiers for sub-patterns", () =>
      expect(regex(qw('a aa aaaaa'), { substitutions: { a: 'foo', aa: 'bar', aaa: 'baz' } })).toEqual(
        /(?:bazbar|bar|foo)/,
      ))
  })
  describe('API', () => {
    describe('regex', () => {
      test('first', () => expect(regex(['cat', 'cats'])).toEqual(/cats?/))
      test('second', () =>
        expect(regex(['cat', 'dog', 'mouse', 'camel', 'dromedary', 'muskrat'], { bound: true, flags: 'i' })).toEqual(
          /\b(?:ca(?:mel|t)|d(?:og|romedary)|m(?:ouse|uskrat))\b/i,
        ))
    })
    describe('ListMatcherOptions', () => {
      describe('bound', () => {
        test('first', () => expect(regex(['cat', '@#$'], { bound: true })).toEqual(/(?:@#\$|\bcat\b)/))
        test('second', () =>
          expect(regex(['süß', 'bloß'], { bound: true })).toEqual(/(?<![\p{L}\p{N}_])(?:blo|sü)ß(?![\p{L}\p{N}_])/u))
      })
      describe('capture', () => {
        test('first', () => expect(regex(qw('cat cats'), { capture: true })).toEqual(/(cats?)/))
      })
      describe('normalizeWhitespace', () => {
        test('first', () =>
          expect(regex([' cat ', 'cat   dog'], { normalizeWhitespace: true })).toEqual(/cat(?:\s+dog)?/))
      })
      describe('flags', () => {
        test('first', () => expect(regex(['CAT'], { flags: 'iug' })).toEqual(/cat/giu))
      })
      describe('substitutions', () => {
        test('simple', () =>
          expect(regex(['b###-####b'], { substitutions: { '#': '\\d', b: '\\b' } })).toEqual(/\b\d{3}-\d{4}\b/))
        let subjects = regex(['Anne', 'Bob', 'Carol'], { bound: true })
        let verbs = regex(['eats', 'throws', 'pats'], { bound: true })
        let objects = regex(['clams', 'rocks', 'chunks'], { bound: true })

        let clauses = regex(['V S O', 'S V O', 'S O V'], {
          normalizeWhitespace: true,
          substitutions: { V: verbs.source, S: subjects.source, O: objects.source },
        })
        test('complex', () =>
          expect(clauses).toEqual(
            /(?:\b(?:Anne|Bob|Carol)\b\s+(?:\b(?:c(?:hunk|lam)|rock)s\b\s+\b(?:eat|pat|throw)s\b|\b(?:eat|pat|throw)s\b\s+\b(?:c(?:hunk|lam)|rock)s\b)|\b(?:eat|pat|throw)s\b\s+\b(?:Anne|Bob|Carol)\b\s+\b(?:c(?:hunk|lam)|rock)s\b)/,
          ))
      })
    })
    describe('qw', () => {
      test('first', () =>
        expect(qw('  some  words  with  spaces  between  them  ')).toEqual([
          'some',
          'words',
          'with',
          'spaces',
          'between',
          'them',
        ]))
      test('second', () => expect(qw('some text', '')).toEqual(['s', 'o', 'm', 'e', ' ', 't', 'e', 'x', 't']))
      test('third', () =>
        expect(qw('bird, bird, bird: bird is the word', /bird/)).toEqual([', ', ', ', ': ', ' is the word']))
      test('fourth', () => expect(qw('foo bar baz', /([aeiou])/)).toEqual(['f', 'o', 'o', ' b', 'a', 'r b', 'a', 'z']))
    })
  })
})

describe('index.ts', () => {
  describe('regex', () => {
    test('simplish', () =>
      expect(regex(qw('cat camel coulomb dog e f g h i'))).toEqual(/(?:c(?:a(?:mel|t)|oulomb)|dog|[e-i])/))
    test('telephone numbers', () =>
      expect(
        regex(['+## #### ######b', 'b###-####b', '(###) ###-####b'], { substitutions: { b: '\\b', '#': '\\d' } }),
      ).toEqual(/(?:\(\d{3}\) \d{3}-|\+\d\d \d{4} \d\d|\b\d{3}-)\d{4}\b/))
  })
})
