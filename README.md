# text/template JS

## Introduction

What is this? An tentative of implementation from scratch of something looking like Go's [text/template](https://pkg.go.dev/text/template) from the standard library, but in JS.

Why? I don't know, why not? It was a fun little project I worked on for a few days on and off because it looked funny at first.

Oh, there is a playground available [here](https://entrivax.github.io/text-template-js/).

## Warning

It's something I made from scratch, it's intended to *mostly* parse templates that work for Go's text/template, that doesn't mean it is 100% the case.

There is some templates that work with this library that doesn't work with the original parser. It's also possible that the opposite is true.

There is some differences in the error handling too, some errors will only appear when executing the template when they are detected during the parsing phase in the original library, maybe that's something I will work on later, I don't know.

The interface is subject to change, nothing is set in stone yet.

## Installation

Take the file `text-template.js` and shove it in your project or something, I will not bother with package managers for this repo, you're on your own.

## How to use

Simple template:
```js
const templateSrc = `Hello {{.Name}}!`

// Parse the template source, the template instance can be reused as many time as your want afterwards, no need to reparse it each time
const template = Template.mustParse(templateSrc)

// Execute the template with some data
console.log(template.sExecute({ Name: "Bob" })) // Will print "Hello Bob!"
console.log(template.sExecute({ Name: "Sarah" })) // Will print "Hello Sarah!"
```

With custom functions:
```js
const templateSrc = `Hello {{.Name | upper}}!
Hello {{upper .Name}}!`

// Parse the template source, the template instance can be reused as many time as your want afterwards, no need to reparse it each time
const template = Template
    .mustParse(templateSrc)
    .withFuncs({
        upper: (...args) => {
            if (args.length > 1) {
                throw new Error('only one argument supported')
            }
            const str = args[0]
            if (typeof str !== 'string') {
                throw new Error('can only uppercase a string')
            }
            return str.toUpperCase()
        }
    })

// Execute the template with some data
console.log(template.sExecute({ Name: "Bob" })) // Will print "Hello BOB!\nHello BOB!"

template.sExecute({ Name: 2 }) // Will throw the error defined in our function "can only uppercase a string", you will need to try-catch it to handle it
```

## Built-in functions

There are some already built-in functions available to use in templates:
- `and` returns the first falsy argument, the last one if all of them are truthy, this function can take multiple arguments for a shorthand (`arg1 && arg2 && arg3` would translate to `and arg1 arg2 arg3`) (Check the function `Template.isTrue` in `text-template.js` to know what it means to be truthy in this templating language)
- `or` returns the first truthy argument, the last one if all of them are falsy, this function can take multiple arguments for a shorthand (`arg1 || arg2 || arg3` would translate to `or arg1 arg2 arg3`) (Check the function `Template.isTrue` in `text-template.js` to know what it means to be truthy in this templating language)
- `not` return the negation of the argument given
- `eq` returns true if all arguments are equal, has a shorthand for equality check on the first argument (`eq arg1 arg2 arg3 arg4` would translate to `arg1 === arg2 || arg1 === arg3 || arg1 === arg4` in JS with the exception that all arguments will be evaluated)
- `ne` returns true if the two provided arguments are not equal (`ne arg1 arg2` => `arg1 !== arg2`)
- `lt` returns the truth of `arg1 < arg2`
- `le` returns the truth of `arg1 <= arg2`
- `gt` returns the truth of `arg1 > arg2`
- `ge` returns the truth of `arg1 >= arg2`
- `index` returns the value of `arg1[arg2]`
- `slice` returns a slice of an array or a string like `arg1.slice(arg2, arg3)` and would translate to `index arg1 arg2 arg3`
- `len` returns the `.length` of a string or array or the `.size` of a Map, will return 0 if anything else
- `html` returns the HTML escaped string of the first argument
- `json` returns the result of `JSON.stringify(arg1)`
- `urlquery` returns the result of `encodeURIComponent(arg1)`
- `log` calls `console.log(...args)` and returns undefined

## Features

- [x] Pipes `|`
- [x] `range`/`else`/`end`/`break`/`continue`
- [x] `if`/`else if`/`else`/`end`
- [x] `with`/`end`
- [x] Templating `define`/`end`, `template`/`end`, `block`/`end`
- [x] Local variables `$a`
- [x] Global context reference `$`
- [x] Comments `/* comment */`
- [x] Before/after action trim `{{- /* <- The dash on the left will trim the whitespace before the action block. /// The dash on the right will trim the whitespace after the action block -> */ -}}`
- [ ] Muliple templates like `Template.mustParse("...").Parse("secondTemplate", "...")`