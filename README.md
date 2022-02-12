# list-matcher

A library for making non-backtracking regular expressions from a list of strings.

## Synopsis

```ts
import { qw, regex } from 'list-matcher'

// qw is a convenience function for creating arrays of strings
qw("these are the times that try men's souls")
// => ['these', 'are', 'the', 'times', 'that', 'try', 'men\'s', 'souls']
qw('abcdefg', '')
// => ['a', 'b', 'c', 'd', 'e', 'f', 'g']

// minimal case
regex(['cat'])
// => /cat/

// case-insensitive
regex(['CAT'], { flags: 'i' })
// => /cat/i

// more interesting
regex(qw('cat camel coulomb dog e f g h i'))
// => /(?:c(?:a(?:mel|t)|oulomb)|dog|[e-i])/

// it finds simple character classes!
regex(qw('0123456789', ''))
// => /\d/

// it can express character classes as ranges
regex(qw('abcdefghijklmnopqrstuvwxyz_0123456789', ''))
// => /[0-9_a-z]/

// let's make this case-insensitive!
regex(qw('abcdefghijklmnopqrstuvwxyz_0123456789', ''), { flags: 'i' })
// => /\w/i

// non-ascii!
regex(qw('süß bloß'))
// => /(?:blo|sü)ß/u

// find word boundaries for me and do something smart with whitespace
regex(['  cat  ', 'cat', 'cat or dog', '!@##$%^&*'], { bound: true, normalizeWhitespace: true })
// => /(?:!@##\$%\^&\*|\bcat(?:\s+or\s+dog)?\b)/

// what becomes of common whitespace characters?
regex(qw('\t\r\n\f',''))
// => /[\t\n\f\r]/

// what do you get with an empty array?
regex([])
// => /(?!)/

// how about empty strings?
regex([''])
// => /(?!)/

// word boundaries in non-ascii strings?
regex(qw('süß bloß'), { bound: true })
// => /(?<![\p{L}\p{N}_])(?:blo|sü)ß(?![\p{L}\p{N}_])/u

// what if I want to make an expression for splitting strings and keeping the boundary bits?
let splitter = regex(qw('cat dog bird'), { capture: true })
// => /((?:bird|cat|dog))/
'the cat saw a birddog'.split(splitter)
// => [ 'the ', 'cat', ' saw a ', 'bird', '', 'dog', '' ]

// and can we use this to combine patterns?
let telephoneNumbers = [
    'b###-####b',
    '(###) ###-####b',
    'b###-###-####b',
    '+#-###-###-####b',
    '+## #### ######b'
]
regex(telephoneNumbers, { substitutions: { '#': '\\d', 'b': '\\b' } })
// => /(?:\(\d{3}\) \d{3}-|\+\d(?:-\d{3}-\d{3}-|\d \d{4} \d\d)|\b\d{3}-(?:\d{3}-)?)\d{4}\b/

// NOTE: you don't need to use single-character identifiers for sub-patterns
regex(qw('a aa aaaaa'), { substitutions: { 'a': 'foo', 'aa': 'bar', 'aaa': 'baz' } })
// => /(?:bazbar|bar|foo)/

// sub-patterns keys are matched greedily, so 'aaaaa' becomes /bazbar/, not /foofoofoofoofoo/, etc.
```

## API

### `regex`

Takes an array of strings and, optionally, a `ListMatcherOptions` object.

Returns a compiled `RegExp`.

```ts
import { regex } from 'list-matcher'

regex(['cat', 'cats'])
// => /cats?/
regex(['cat', 'dog', 'mouse', 'camel', 'dromedary', 'muskrat'], { bound: true, flags: 'i' })
// => /\b(?:ca(?:mel|t)|d(?:og|romedary)|m(?:ouse|uskrat))\b/i
```

### `ListMatcherOptions`

Various directives controlling how `regex` builds a regular expression.

#### `bound`: `boolean`

`regex` should discover and preserve word boundaries. See Caveats for problems that may arise under certain javascript engines.

```ts
regex(['cat', '@#$'], { bound: true })
// => /(?:@#\$|\bcat\b)/
regex(['süß', 'bloß'], { bound: true })
// => /(?<![\p{L}\p{N}_])(?:blo|sü)ß(?![\p{L}\p{N}_])/u
```

#### `capture`: `boolean`

`regex` should generated expression in parentheses.

```ts
regex(qw('cat cats'), { capture: true })
// => /(cats?)/
```

The chief use envisioned for this is creating an expression that can be given to `String.prototype.split` to split a string while preserving the expression split on.

#### `normalizeWhitespace`: `boolean`

`regex` should trim marginal whitespace from words and treat internal whitespace as equivalent to `/\s+/`.

```ts
regex([' cat ', 'cat   dog'], { normalizeWhitespace: true })
// => /cat(?:\s+dog)?/
```

#### `flags`: `string`
Regular expression flags, such as `i`, `m`, `s`, `g`, `u`, and `y`.

```ts
regex(['CAT'], { flags: 'iug' })
// => /cat/giu
```

The order of flags in the flag string is irrelevant. Characters other than those listed above will be ignored.

*Note*, two of the flags, `i` and `u`, may have other effects on the generated regular expression.

`i` causes all phrases to be downcased.

`u` changes the definition of word boundaries. Instead of matching on the margin between `\w` and `\W` or the ends of the string,
unicode word boundary expression match on the margin between any word or number character or `_` and the ends of the string.
In order to do this the pattern must use a lookbehind, which may not be implemented in every javascript engine. If you don't set
the `bound` option, this is irrelevant.

Another peculiarity of the `u` flag is that `regex` will turn it on even if not requested if it finds a non-ASCII character among
the phrases it is given.

#### `substitutions`: `Record<string, string>`

The substitution map, if supplied, defines portions of input phrases that should be replaced with other expressions.

```ts
regex(['b###-####b'], { substitutions: { '#': '\\d', 'b': '\\b' } })
// => /\b\d{3}-\d{4}\b/
```

This mechanism obviously allows you to feed the output of `regex` back into `regex`:

```ts
let subjects = regex(['Anne', 'Bob', 'Carol'], { bound: true })
let verbs    = regex(['eats', 'throws', 'pats'], { bound: true })
let objects  = regex(['clams', 'rocks', 'chunks'], { bound: true })

let clauses = regex(['V S O', 'S V O', 'S O V'], { normalizeWhitespace: true, substitutions: { V: verbs.source, S: subjects.source, O: objects.source } })
// => /(?:\b(?:Anne|Bob|Carol)\b\s+(?:\b(?:c(?:hunk|lam)|rock)s\b\s+\b(?:eat|pat|throw)s\b|\b(?:eat|pat|throw)s\b\s+\b(?:c(?:hunk|lam)|rock)s\b)|\b(?:eat|pat|throw)s\b\s+\b(?:Anne|Bob|Carol)\b\s+\b(?:c(?:hunk|lam)|rock)s\b)/
```

This example makes apparent the regretable lack of the `(?i:...)` expression in javascript regular expressions. We must have case insensitivity for
the whole expression or none of it, alas.

### `qw`

Takes a string and, optionally, a splitter, either a string or a regular expression.

Returns an array of non-empty strings.

```ts
import { qw } from 'list-matcher'

qw('  some  words  with  spaces  between  them  ')
// => ['some', 'words', 'with', 'spaces', 'between', 'them']
qw('some text', '')
// => ['s', 'o', 'm', 'e', ' ', 't', 'e', 'x', 't']
qw('bird, bird, bird: bird is the word', /bird/)
// => [', ', ', ', ': ', ' is the word']
qw('foo bar baz', /([aeiou])/)
// => ['f', 'o', 'o', ' b', 'a', 'r b', 'a', 'z']
```

This is an exported function of `list-matcher` chiefly because it made documenting the library easier and clearer. The implementation is quite simple:

```ts
export function qw(s: string, splitter: string | RegExp = /\s+/): string[] {
  return s.split(splitter).filter((p) => p)
}
```

The name and behavior of `qw` are inspired by the [Perl qw array literal expression](https://perlmaven.com/qw-quote-word), which is like
[Ruby's %w](https://docs.ruby-lang.org/en/2.0.0/syntax/literals_rdoc.html#label-Percent+Strings), etc.

## Advantages

1. Compiling regular expressions this way produces more readable code. It's clear what `regex(['cat', 'carp', 'camel'])` does. It's less clear what `/ca(?:mel|rp|t)/` does.
2. You can use `regex` programmatically, building matchers for dynamic lists of great length.
3. You don't need to worry about escaping metacharacters.

## Embedding

If you wish to embed one regular expression in another, this won't work:
```ts
new RegExp(`other stuff with ${regex(list)} a regex in the middle`)
```
The interpolated regular expression will be delimited by forward slashes and may
potentially include flag characters.

You can, however, do this:
```ts
new RegExp(`other stuff with ${regex(list).source} a regex in the middle`)
```

## Efficiency

The regular expression generated by `list-matcher` are non-backtracking, so they should be optimally efficient.
In some javascript engines this will actually give you a performance boost. Safari is the only engine where I've
seen this. The others compile naive regular expressions like `/cat|camel|carp/` into non-backtracking automata
such as you would get from `/ca(?:mel|rp|t)/` without any optimization.

The construction of regular expressions from lists is fairly swift, but still, as with the ordinary compilation of regular
expressions, you should avoid doing this in a tight loop.

## Caveats

Though I have taken some care to handle non-ASCII characters, I have not yet thoroughly tested
higher number codepoints. In particular, I have not tested the matching of combined unicode characters.

`list-matcher` relies heavily on `String.prototype.fromCharCode` and `String.prototype.codePointAt` and
other functions in the `String` prototype. Not all of these are implemented in all browsers. `list-matcher`
therefore includes polyfills that supply these if they are absent. All polyfills are borrowed from
[the Mozilla Developer Network](https://developer.mozilla.org).

There are regular expression features used in finding and defining unicode word boundaries. These are
not present in all javascript engines either, and they cannot be polyfilled.
- [look behinds](https://caniuse.com/js-regexp-lookbehind)
- [property escapes](https://caniuse.com/mdn-javascript_builtins_regexp_property_escapes)

If you either avoid unicode, avoid the `bound` option, or avoid the browers that have not implemented these
features, you will be okay.

If you use `substitutions`, you are responsible for the patterns subsituted in; `list-matcher` won't check
them.

## Acknowledgements

As always I thank my co-workers at [Green River](https://www.greenriver.com/) and my family for indulging me while I tilt at windmills.
