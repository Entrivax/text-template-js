/**
 * @typedef {{stringKind: TemplateLexer.TokenKind[keyof TemplateLexer.TokenKind], value: string, pos: number, line: number, col: number, endPos: number, endLine: number, endCol: number, kind: number}} Token
 **/

/**
 * 
 * @param {string} src 
 */
function TemplateLexer(src) {
    this.src = src
    this.pos = 0
    this.line = 0
    this.col = 0
    /** @type {Token[]} */
    this.tokens = []
    this.errors = []
}

TemplateLexer.TokenKind = {
    EOF: Symbol("EOF"),
    DATA: Symbol("DATA"),
    PIPE: Symbol("PIPE"),
    NUMBER: Symbol("NUMBER"),
    STRING: Symbol("STRING"),
    NIL: Symbol("NIL"),
    BOOL: Symbol("BOOL"),
    IDENTIFIER: Symbol("IDENTIFIER"),
    KEYWORD: Symbol("KEYWORD"),
    PAREN_OPEN: Symbol("PAREN_OPEN"),
    PAREN_CLOSE: Symbol("PAREN_CLOSE"),
    COMMENT: Symbol("COMMENT"),
    WHITESPACE: Symbol("WHITESPACE"),
    DOT: Symbol("DOT"),
    DECLARE: Symbol("DECLARE"),
    EQUAL: Symbol("EQUAL"),
    COMMA: Symbol("COMMA"),
    ACTION_START: Symbol("ACTION_START"),
    ACTION_END: Symbol("ACTION_END"),
}

TemplateLexer.enumify = function(enu) {
    const keys = Object.keys(enu)
    for (let i = 0; i < keys.length; i++) {
        if (!isNaN(+keys[i])) {
            continue
        }
        const val = enu[keys[i]]
        enu[val] = keys[i]
    }
}

TemplateLexer.enumify(TemplateLexer.TokenKind)

TemplateLexer.Chars = {
    ACTION_DELIMITER_START: "{{",
    ACTION_DELIMITER_END: "}}",
    ACTION_DELIMITER_TRIM: "-",
    DOT: ".",
    VARIABLE_PREFIX: "$",
    STRING_DELIM: "\"",
    PIPE: "|",
    COMMENT_START: "/*",
    COMMENT_END: "*/",
    DECLARE: ":=",
    EQUAL: "=",
    COMMA: ",",
    NIL: "nil",
}

TemplateLexer.ReservedKeywords = new Set([
    "if",
    "else",
    "end",
    "range",
    "break",
    "continue",
    "template",
    "block",
    "define",
    "with",
])

TemplateLexer.lex = function(src) {
    const lexer = new TemplateLexer(src)
    lexer.lex()
    return { tokens: lexer.tokens, errors: lexer.errors }
}

TemplateLexer.prototype = {
    lex() {
        let trimNext = false
        for (;this.pos < this.src.length;) {
            if (this._isStartingAction()) {
                trimNext = this._handleAction()
                continue
            }
            this._handleData(trimNext)
        }

        this.tokens.push(this._createToken(TemplateLexer.TokenKind.EOF, "", this.pos, this.line, this.col, this.pos, this.line, this.col))
    },

    _isStartingAction() {
        return this._peekSeq(TemplateLexer.Chars.ACTION_DELIMITER_START)
    },

    _getEndingAction() {
        const hasTrimChar = this.src[this.pos] === TemplateLexer.Chars.ACTION_DELIMITER_TRIM
        const isEndingAction = this.src.slice(this.pos + +hasTrimChar, this.pos + +hasTrimChar + TemplateLexer.Chars.ACTION_DELIMITER_START.length) === TemplateLexer.Chars.ACTION_DELIMITER_END
        return {
            hasTrimChar: hasTrimChar,
            isEndingAction: isEndingAction
        }
    },

    /**
     * @param {boolean} trimStart 
     */
    _handleData(trimStart) {
        let buffer = ''
        let trimEnd = false
        const startLine = this.line
        const startCol = this.col
        const startPos = this.pos
        for (;this.pos < this.src.length;) {
            const currentChar = this.src[this.pos]
            if (this._isStartingAction()) {
                if (this.src[this.pos + TemplateLexer.Chars.ACTION_DELIMITER_START.length] === TemplateLexer.Chars.ACTION_DELIMITER_TRIM) {
                    trimEnd = true
                }
                break
            }
            buffer += currentChar
            this._advance()
        }
        
        if (trimEnd && trimStart) {
            buffer = buffer.trim()
        } else if (trimStart) {
            buffer = buffer.trimStart()
        } else if (trimEnd) {
            buffer = buffer.trimEnd()
        }

        if (buffer.length > 0) {
            this.tokens.push(this._createToken(TemplateLexer.TokenKind.DATA, buffer, startPos, startLine, startCol, this.pos, this.line, this.col))
        }
    },

    _handleAction() {
        this._handleSimple(TemplateLexer.Chars.ACTION_DELIMITER_START, TemplateLexer.TokenKind.ACTION_START)
        if (this.src[this.pos] === TemplateLexer.Chars.ACTION_DELIMITER_TRIM) {
            this._advance()
        }
        let trimNextDataBlock = false

        let eof = true

        for (;this.pos < this.src.length;) {
            eof = true
            const actionEnding = this._getEndingAction()
            if (actionEnding.isEndingAction) {
                if (actionEnding.hasTrimChar) {
                    trimNextDataBlock = true
                    this._advance()
                }
                this._handleSimple(TemplateLexer.Chars.ACTION_DELIMITER_END, TemplateLexer.TokenKind.ACTION_END)
                eof = false
                break
            }

            if (this._isWhitespace(this.src[this.pos])) {
                this._handleWhitespace()
                continue
            }
            if (this._peekSeq(TemplateLexer.Chars.COMMENT_START)) {
                this._handleComment()
                continue
            }
            if (this._peekString()) {
                this._handleString()
                continue
            }
            if (this._handleSimple('(', TemplateLexer.TokenKind.PAREN_OPEN) ||
                this._handleSimple(')', TemplateLexer.TokenKind.PAREN_CLOSE) ||
                this._handleSimple(TemplateLexer.Chars.COMMA, TemplateLexer.TokenKind.COMMA) ||
                this._handleSimple(TemplateLexer.Chars.DECLARE, TemplateLexer.TokenKind.DECLARE) ||
                this._handleSimple(TemplateLexer.Chars.EQUAL, TemplateLexer.TokenKind.EQUAL) ||
                this._handleSimple(TemplateLexer.Chars.DOT, TemplateLexer.TokenKind.DOT) ||
                this._handleSimple(TemplateLexer.Chars.PIPE, TemplateLexer.TokenKind.PIPE) ||
                this._handleSimple(TemplateLexer.Chars.NIL, TemplateLexer.TokenKind.NIL)) {
                continue
            }
            if (this._peekNumber()) {
                this._handleNumber()
                continue
            }
            if (this._peekIdentifierOrKeyword()) {
                this._handleIdentifierOrKeyword()
                continue
            }

            this._emitError("unexpected character " + this.src[this.pos])
            if (!this._advanceUntil(TemplateLexer.Chars.ACTION_DELIMITER_END)) {
                return
            }
        }

        if (eof) {
            this._emitError("unexpected EOF")
        }

        return trimNextDataBlock
    },

    _isWhitespace(c) {
        return c === ' ' || c === '\n' || c === '\t' || c === '\r'
    },

    _peekSeq(seq) {
        for (let i = this.pos, j = 0; j < seq.length; i++,j++) {
            if (i >= this.src.length || this.src[i] !== seq[j]) {
                return false
            }
        }
        return true
    },

    _handleSimple(seq, tokenKind) {
        if (this._peekSeq(seq)) {
            const startLine = this.line
            const startCol = this.col
            const startPos = this.pos
            this._advanceN(seq.length)
            this.tokens.push(this._createToken(tokenKind, seq, startPos, startLine, startCol, this.pos, this.line, this.col))
            return true
        }
        return false
    },

    _handleWhitespace() {
        const startLine = this.line
        const startCol = this.col
        const startPos = this.pos
        let buffer = this.src[this.pos]
        this._advance()
        for (;this.pos < this.src.length && this._isWhitespace(this.src[this.pos]); buffer += this.src[this.pos], this._advance()) {}

        this.tokens.push(this._createToken(TemplateLexer.TokenKind.WHITESPACE, buffer, startPos, startLine, startCol, this.pos, this.line, this.col))
    },

    _peekString() {
        return this._peekSeq(TemplateLexer.Chars.STRING_DELIM)
    },
    _handleString() {
        const startLine = this.line
        const startCol = this.col
        const startPos = this.pos
        let buffer = ''
        this._advanceN(TemplateLexer.Chars.STRING_DELIM.length)
        for (;this.pos < this.src.length;) {
            if (this._peekSeq('\\')) {
                this._advance()
                const c = this.src[this.pos]
                switch (c) {
                case '\\':
                    buffer += '\\'
                    break
                case 'n':
                    buffer += '\n'
                    break
                case 'r':
                    buffer += '\r'
                    break
                case 't':
                    buffer += '\t'
                    break
                case TemplateLexer.Chars.STRING_DELIM:
                    buffer += TemplateLexer.Chars.STRING_DELIM
                    break
                case null:
                case undefined:
                case '\0':
                case '\n':
                case '\r':
                    this._emitError('unfinished escape sequence')
                    if (c) {
                        this._advance()
                    }
                    this.tokens.push(this._createToken(TemplateLexer.TokenKind.STRING, buffer, startPos, startLine, startCol, this.pos, this.line, this.col))
                default:
                    this._emitError('unknown escape sequence \\'+c)
                }
                this._advance()
                continue
            }
            const c = this.src[this.pos]
            if (c === '\n') {
                this._emitError('unfinished string')
                this._advance()
                this.tokens.push(this._createToken(TemplateLexer.TokenKind.STRING, buffer, startPos, startLine, startCol, this.pos, this.line, this.col))
                return
            }
            if (this._peekSeq(TemplateLexer.Chars.STRING_DELIM)) {
                this._advance()
                this.tokens.push(this._createToken(TemplateLexer.TokenKind.STRING, buffer, startPos, startLine, startCol, this.pos, this.line, this.col))
                return
            }
            buffer += c
            this._advance()
        }
        this._emitError('unfinished string')
        this.tokens.push(this._createToken(TemplateLexer.TokenKind.STRING, buffer, startPos, startLine, startCol, this.pos, this.line, this.col))
    },

    _handleComment() {
        this._advanceN(TemplateLexer.Chars.COMMENT_START.length)
        const startLine = this.line
        const startCol = this.col
        const startPos = this.pos
        let buffer = ''
        for (;this.pos < this.src.length;) {
            if (this._peekSeq(TemplateLexer.Chars.COMMENT_END)) {
                this._advanceN(TemplateLexer.Chars.COMMENT_END.length)
                this.tokens.push(this._createToken(TemplateLexer.TokenKind.COMMENT, this.src.slice(startPos, this.pos), startPos, startLine, startCol, this.pos, this.line, this.col))
                return
            }
            buffer += this.src[this.pos]
            this._advance()
        }
        // Uh oh, template ended before the comment was closed
        this._emitError("not closed comment")
    },

    _peekIdentifierOrKeyword() {
        const currentChar = this.src[this.pos]
        return (currentChar >= 'a' && currentChar <= 'z') || (currentChar >= 'A' && currentChar <= 'Z') || currentChar === "_" || currentChar === TemplateLexer.Chars.VARIABLE_PREFIX || currentChar === TemplateLexer.Chars.DOT
    },
    _handleIdentifierOrKeyword() {
        let startLine = this.line
        let startCol = this.col
        let startPos = this.pos
        let depth = 0
        let identifier = ''
        for (;this.pos < this.src.length;) {
            const currentChar = this.src[this.pos]
            if ((currentChar >= 'a' && currentChar <= 'z') ||
                (currentChar >= 'A' && currentChar <= 'Z') ||
                (currentChar >= '0' && currentChar <= '9') ||
                (currentChar === "_") || (currentChar === TemplateLexer.Chars.VARIABLE_PREFIX)
            ) {
                identifier += currentChar
                this._advance()
            } else {
                break
            }
        }

        if (identifier.length > 0) {
            this.tokens.push(this._createToken(depth === 0 && TemplateLexer.ReservedKeywords.has(identifier) ? TemplateLexer.TokenKind.KEYWORD : TemplateLexer.TokenKind.IDENTIFIER, identifier, startPos, startLine, startCol, this.pos, this.line, this.col))
        }
    },

    _peekNumber() {
        const startWithDash = this.src[this.pos] === '-'
        const currentChar = this.src[this.pos + +startWithDash]
        return currentChar >= '0' && currentChar <= '9'
    },

    _handleNumber() {
        let startLine = this.line
        let startCol = this.col
        let startPos = this.pos
        let number = ''
        for (;this.pos < this.src.length;) {
            const currentChar = this.src[this.pos]
            if ((number.length === 0 && currentChar === '-') || (currentChar >= '0' && currentChar <= '9') || (currentChar === '.' && number.indexOf('.') === -1)) {
                number += currentChar
                this._advance()
            } else {
                break
            }
        }
        const nextChar = this.src[this.pos]
        if (!this._isWhitespace(nextChar) && !this._peekSeq(')') && !this._peekSeq(TemplateLexer.Chars.PIPE) && !this._peekSeq(TemplateLexer.Chars.ACTION_DELIMITER_END) && !this._peekSeq(TemplateLexer.Chars.ACTION_DELIMITER_TRIM+TemplateLexer.Chars.ACTION_DELIMITER_END)) {
            this._emitError('unexpected char after number ' + nextChar)
        }
        this.tokens.push(this._createToken(TemplateLexer.TokenKind.NUMBER, number, startPos, startLine, startCol, this.pos, this.line, this.col))
    },

    _advance() {
        const currentChar = this.src[this.pos]
        // Ignore the carriage return char in the column count
        if (currentChar !== "\r") {
            this.col++
        }
        this.pos++
        if (currentChar === "\n") {
            this.line++
            this.col = 0
        }
    },

    _advanceN(n) {
        for (let i = 0; i < n; i++) {
            this._advance()
        }
    },

    _advanceUntil(seq) {
        for (;this.pos < this.src.length;) {
            if (this._peekSeq(seq)) {
                return true
            }
            this._advance()
        }
        return false
    },

    /**
     * 
     * @param {Symbol} kind 
     * @param {string} value 
     * @param {number} pos 
     * @param {number} line 
     * @param {number} col 
     * @param {number} endPos 
     * @param {number} endLine 
     * @param {number} endCol 
     * @returns {Token}
     */
    _createToken(kind, value, pos, line, col, endPos, endLine, endCol) {
        return {
            stringKind: kind.description, value, pos, line, col, kind, endPos, endLine, endCol,
        }
    },

    _emitError(err) {
        this.errors.push({
            message: err,
            line: this.line,
            col: this.col,
            pos: this.pos,
        })
    }
}

/**
 * @param {string} src
 * @param {Token[]} tokens
 */
function TemplateParser(src, tokens) {
    this.src = src
    this.tokens = tokens
    /** @type {Node[]} */
    this.nodes = []
    this.pos = 0
    this.errors = []
    /** @type {Record<string | symbol, Node[]>} */
    this.templates = {}
}

/** @typedef {{ executeS: (contextData: ScopeStack) => string }} RootTemplateNode */

/**
 * @param {string} src
 * @param {Token[]} tokens
 */
TemplateParser.parse = function(src, tokens) {
    const parser = new TemplateParser(src, tokens)
    parser.parse()
    return parser
}

TemplateParser.ROOT_TEMPLATE = Symbol('root template')

TemplateParser.prototype = {
    parse() {
        this._parseNodes(this.nodes, true)
        this.templates[TemplateParser.ROOT_TEMPLATE] = this.nodes
    },

    /**
     * @param {Node[]} nodes 
     */
    _parseNodes(nodes, rootLevel = false) {
        for (;this.pos <= this.tokens.length && this.tokens[this.pos].kind !== TemplateLexer.TokenKind.EOF;) {
            const token = this.tokens[this.pos]
            if (token.kind === TemplateLexer.TokenKind.DATA) {
                nodes.push(this._createDataNode(token.value))
                this.pos++
                continue
            }
            if (token.kind === TemplateLexer.TokenKind.ACTION_START) {
                const pipelineNode = this._parseAction(rootLevel)
                if (pipelineNode) {
                    nodes.push(pipelineNode)
                }
                continue
            }
            if (token.kind === TemplateLexer.TokenKind.ACTION_END) {
                this.pos++
                continue
            }

            if (token.kind === TemplateLexer.TokenKind.KEYWORD && (token.value === 'end' || token.value === 'else')) {
                return
            }
        }
    },

    _parseAction(rootLevel = false) {
        this._advanceToNonWhitespace()

        for (;this.pos <= this.tokens.length;) {
            const token = this.tokens[this.pos]
            switch (token.kind) {
            case TemplateLexer.TokenKind.ACTION_END:
                return
            case TemplateLexer.TokenKind.EOF:
                this._emitError("unexpected EOF")
                return
            case TemplateLexer.TokenKind.KEYWORD:
                const nextToken = this.tokens[this.pos + 1]
                if (!this._expectTokenKind(nextToken, TemplateLexer.TokenKind.ACTION_END, TemplateLexer.TokenKind.WHITESPACE)) {
                    this._emitError("unexpected token after keyword")
                    // Cannot safely parse the action, skip to the end
                    this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                    return
                }
                switch (token.value) {
                case 'if':
                    return this._parseIf()
                case 'else':
                    return
                case 'end':
                    return
                case 'range':
                    return this._parseRange()
                case 'break':
                    return this._parseBreak()
                case 'continue':
                    return this._parseContinue()
                case 'with':
                    return this._parseWith()
                case 'block':
                    return this._parseBlock()
                case 'template':
                    return this._parseTemplate()
                case 'define':
                    if (!rootLevel) {
                        this._emitError("define can only be used at root level")
                        this.pos++
                        return
                    }
                    return this._parseDefine()
                }
                this.pos++
                break

            case TemplateLexer.TokenKind.IDENTIFIER:
                const currentPos = this.pos
                const result = this._tryParseAssign()
                if (!result.success && !result.error) {
                    this.pos = currentPos
                    return this._parsePipeline()
                }
                if (result.error) {
                    // Cannot safely parse the action, skip to the end
                    this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                }

                return result.node
            case TemplateLexer.TokenKind.BOOL:
            case TemplateLexer.TokenKind.DOT:
            case TemplateLexer.TokenKind.NIL:
            case TemplateLexer.TokenKind.NUMBER:
            case TemplateLexer.TokenKind.PAREN_OPEN:
            case TemplateLexer.TokenKind.STRING:
                return this._parsePipeline()
            default:
                this._emitError("unexpected token")
                // Cannot safely parse the action, skip to the end
                this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                return
            }
        }
    },

    _parseIf(isRange = false) {
        this.pos++
        const ifNodes = []
        const elseNodes = []
        const conditionNode = this._parsePipeline()

        if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
            this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
        }
        this.pos++
        this._parseNodes(ifNodes)
        if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.KEYWORD) {
            let endHandled = false
            if (!isRange && this.tokens[this.pos].value === 'else') {
                this._advanceToNonWhitespace()
                if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.KEYWORD && this.tokens[this.pos].value === 'if') {
                    elseNodes.push(this._parseIf())
                    endHandled = true
                } else {
                    if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
                        this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                    }
                    this.pos++
                    this._parseNodes(elseNodes)
                }
            }
            if (!endHandled && this.tokens[this.pos].kind === TemplateLexer.TokenKind.EOF) {
                this._emitError('not terminated ' + (isRange ? 'range' : 'if'))
                return
            }
            if (!endHandled && this.tokens[this.pos].value === 'end') {
                this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                this.pos++
            }
        } else if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.EOF) {
            this._emitError('not terminated ' + (isRange ? 'range' : 'if'))
            return
        }

        return this._createIfNode(conditionNode, ifNodes, elseNodes)
    },

    _parseWith() {
        this._advanceToNonWhitespace()
        const truthyNodes = []
        const falsyNodes = undefined
        if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.IDENTIFIER && this.tokens[this.pos].kind !== TemplateLexer.TokenKind.DOT) {
            this._emitError("expected pipeline or declaration")
            this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
            return
        }
        const currentPos = this.pos
        const assignResult = this._tryParseAssign()
        let pipelineNode = undefined
        if (!assignResult.success && !assignResult.error) {
            this.pos = currentPos
            pipelineNode = this._parsePipeline()
        }
        if (assignResult.node instanceof AssignNode) {
            this._emitError("expected := instead of =")
            this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
            return
        }

        if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
            this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
        }
        this.pos++
        this._parseNodes(truthyNodes)
        if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.KEYWORD) {
            if (this.tokens[this.pos].value === 'else') {
                this._advanceToNonWhitespace()
                falsyNodes = []
                if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.KEYWORD && this.tokens[this.pos].value === 'with') {
                    falsyNodes.push(this._parseWith())
                } else {
                    if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
                        this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                    }
                    this.pos++
                    this._parseNodes(falsyNodes)
                }
            }

            if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.EOF) {
                this._emitError('not terminated with')
                return
            }
            if (this.tokens[this.pos].value === 'end') {
                this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
                    this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                }
                this.pos++
            }
        } else {
            this._emitError('not terminated with')
            return
        }

        return this._createWithNode(assignResult.node, pipelineNode, truthyNodes, falsyNodes)
    },

    _parseDefine() {
        this._advanceToNonWhitespace()
        const nodes = []
        if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.STRING) {
            this._emitError("expected string")
            this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
        }
        const templateName = this.tokens[this.pos].value

        if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
            this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
        }
        this.pos++

        this._parseNodes(nodes)
        if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.KEYWORD) {
            if (this.tokens[this.pos].value === 'end') {
                this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.EOF) {
                    this._emitError('not terminated define')
                    return
                }
                if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
                    this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                }
                this.pos++
            }
        } else {
            this._emitError('not terminated define')
            return
        }

        this.templates[templateName] = nodes
        return undefined
    },

    _parseTemplate() {
        this._advanceToNonWhitespace()
        if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.STRING) {
            this._emitError("expected string")
            this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
        }
        const templateName = this.tokens[this.pos].value
        this._advanceToNonWhitespace()
        let pipelineNode = undefined
        if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
            pipelineNode = this._parsePipeline()
            if (!pipelineNode) {
                this._emitError("expected pipeline")
            }
            if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
                this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
            }
        }
        this.pos++

        return this._createTemplateNode(templateName, pipelineNode)
    },

    _parseBlock() {
        this._advanceToNonWhitespace()
        if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.STRING) {
            this._emitError("expected string")
            this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
        }
        const nodes = []
        const templateName = this.tokens[this.pos].value
        this._advanceToNonWhitespace()
        let pipelineNode = undefined
        if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
            pipelineNode = this._parsePipeline()
            if (!pipelineNode) {
                this._emitError("expected pipeline")
            }
            if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
                this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
            }
        }
        this.pos++

        this._parseNodes(nodes)
        if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.KEYWORD) {
            if (this.tokens[this.pos].value === 'end') {
                this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.EOF) {
                    this._emitError('not terminated block')
                    return
                }
                if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
                    this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                }
                this.pos++
            }
        } else if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.EOF) {
            this._emitError('not terminated block')
            return
        }

        return this._createBlockNode(templateName, pipelineNode, nodes)
    },

    _parseRange() {
        this._advanceToNonWhitespace()
        let var1Token = undefined
        let var2Token = undefined
        parseLeftSide: {
            if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.IDENTIFIER || this.tokens[this.pos].value[0] !== TemplateLexer.Chars.VARIABLE_PREFIX) {
                break parseLeftSide
            }
            const tokenAfterFirst = this._peekToNonWhitespace()
            if (!tokenAfterFirst) {
                return
            }
            if (tokenAfterFirst.token.kind !== TemplateLexer.TokenKind.COMMA && tokenAfterFirst.token.kind !== TemplateLexer.TokenKind.DECLARE) {
                break parseLeftSide
            }
            var1Token = this.tokens[this.pos]
            this._advanceToNonWhitespace()
            if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.COMMA) {
                this._advanceToNonWhitespace()
                let tmpVar2Token = this.tokens[this.pos]
                if (tmpVar2Token.kind !== TemplateLexer.TokenKind.IDENTIFIER || tmpVar2Token.value[0] !== TemplateLexer.Chars.VARIABLE_PREFIX) {
                    this._emitError("expected variable identifier")
                    this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                    return
                }
                var2Token = tmpVar2Token
                this._advanceToNonWhitespace()
            }
            if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.DECLARE) {
                this._emitError("expected :=")
                this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                return
            }
            this.pos++
        }
        const pipelineNode = this._parsePipeline()
        if (!pipelineNode) {
            this._emitError("expected pipeline")
        }
        const truthyNodes = []
        const falsyNodes = []
        if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
            this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
        }
        this.pos++
        this._parseNodes(truthyNodes)
        if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.KEYWORD) {
            let endHandled = false
            if (this.tokens[this.pos].value === 'else') {
                this._advanceToNonWhitespace()
                if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.KEYWORD && this.tokens[this.pos].value === 'if') {
                    elseNodes.push(this._parseIf(true))
                    endHandled = true
                } else {
                    if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
                        this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                    }
                    this.pos++
                    this._parseNodes(falsyNodes)
                }
            }

            if (!endHandled && this.tokens[this.pos].kind === TemplateLexer.TokenKind.EOF) {
                this._emitError('not terminated range')
                return
            }

            if (this.tokens[this.pos].value === 'end') {
                this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                if (this.tokens[this.pos].kind !== TemplateLexer.TokenKind.ACTION_END) {
                    this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
                }
                this.pos++
            }
        } else if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.EOF) {
            this._emitError('not terminated range')
            return
        }

        if (var2Token) {
            return this._createRangeNode(var2Token, var1Token, pipelineNode, truthyNodes, falsyNodes)
        }
        return this._createRangeNode(var1Token, undefined, pipelineNode, truthyNodes, falsyNodes)
    },

    _parseBreak() {
        this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
        return this._createBreakNode()
    },
    _parseContinue() {
        this._advanceToNext(TemplateLexer.TokenKind.ACTION_END)
        return this._createContinueNode()
    },

    /**
     * @returns {{ node?: AssignNode | DeclareNode, success: boolean, error?: boolean }}
     */
    _tryParseAssign() {
        const varToken = this.tokens[this.pos]
        if (varToken.value[0] !== TemplateLexer.Chars.VARIABLE_PREFIX) {
            return { success: false }
        }
        if (varToken.value[0].length <= TemplateLexer.Chars.VARIABLE_PREFIX) {
            // Just a '$'? It's a protected name
            this._emitError("expected variable name")
        }
        this._advanceToNonWhitespace()
        let declareNew = null
        if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.EQUAL) {
            declareNew = false
        } else if (this.tokens[this.pos].kind === TemplateLexer.TokenKind.DECLARE) {
            declareNew = true
        } else {
            return { success: false }
        }
        if (declareNew === null) {
            this._emitError("unexpected token " + varToken.stringKind)
            return { success: false, error: true }
        }
        this._advanceToNonWhitespace()
        const pipelineNode = this._parsePipeline()
        if (!pipelineNode) {
            this._emitError("could not parse pipeline")
            return { success: false, error: true }
        }
        if (declareNew) {
            return {
                success: true,
                node: this._createDeclareNode(varToken, pipelineNode)
            }
        }

        return {
            success: true,
            node: this._createAssignNode(varToken, pipelineNode)
        }
    },

    _parsePipeline() {
        let args = []
        const pipeline = this._createPipelineNode()

        parsingLoop: for (;this.pos <= this.tokens.length && this.tokens[this.pos].kind !== TemplateLexer.TokenKind.EOF;) {
            const token = this.tokens[this.pos]
            switch (token.kind) {
            case TemplateLexer.TokenKind.DOT:
            case TemplateLexer.TokenKind.IDENTIFIER:
                const path = this._parsePipelinePath()
                args.push(this._createAccessNode(path))
                break
            case TemplateLexer.TokenKind.PAREN_OPEN:
                this.pos++
                args.push(this._parsePipeline())
                break
            case TemplateLexer.TokenKind.PAREN_CLOSE:
                this.pos++
                break parsingLoop
            case TemplateLexer.TokenKind.PIPE:
                this.pos++
                pipeline.pushArgs(args)
                args = []
                break
            case TemplateLexer.TokenKind.STRING:
                this.pos++
                args.push(this._createConstantNode(token.value))
                break
            case TemplateLexer.TokenKind.BOOL:
                this.pos++
                args.push(this._createConstantNode(token.value === "true"))
                break
            case TemplateLexer.TokenKind.NUMBER:
                this.pos++
                args.push(this._createConstantNode(+token.value))
                break
            case TemplateLexer.TokenKind.NIL:
                this.pos++
                args.push(this._createConstantNode(null))
                break
            case TemplateLexer.TokenKind.ACTION_END:
                break parsingLoop
            case TemplateLexer.TokenKind.KEYWORD:
                this._emitError("unexpected keyword")
                return
            case TemplateLexer.TokenKind.ACTION_START:
                this._emitError("unexpected action start")
                return
            case TemplateLexer.TokenKind.WHITESPACE:
            case TemplateLexer.TokenKind.COMMENT:
                this._advanceToNonWhitespace()
                break
            default:
                this._emitError("unexpected token")
                this.pos++
                break
            }
        }
        if (args.length === 0 && pipeline.args.length === 0) {
            return undefined
        }
        return pipeline.pushArgs(args)
    },

    _parsePipelinePath() {
        const firstIsDot = this.tokens[this.pos].kind === TemplateLexer.TokenKind.DOT
        const pathNodes = [!firstIsDot ? this._createIdentifierNode(this.tokens[this.pos].value) : this._createContextNode()]
        let lastIsDot = this.tokens[this.pos].kind === TemplateLexer.TokenKind.DOT
        this.pos++
        parsingLoop: for (;this.pos <= this.tokens.length && this.tokens[this.pos].kind !== TemplateLexer.TokenKind.EOF;) {
            const token = this.tokens[this.pos]
            switch (token.kind) {
            case TemplateLexer.TokenKind.DOT:
                if (lastIsDot) {
                    this._emitError("unexpected dot")
                    break parsingLoop
                }
                lastIsDot = true
                break
            case TemplateLexer.TokenKind.IDENTIFIER:
                if (!lastIsDot) {
                    this._emitError("unexpected identifier")
                    break parsingLoop
                }
                lastIsDot = false
                pathNodes.push(this._createFieldNode(token.value))
                break

            default:
                break parsingLoop
            }
            this.pos++
        }
        if ((pathNodes.length > 1 || !firstIsDot) && lastIsDot) {
            this._emitError("unexpected dot at the end of path")
        }
        return pathNodes
    },

    _createPipelineNode() {
        return new PipelineNode()
    },

    _createContextNode() {
        return new ContextNode()
    },

    _createIdentifierNode(name) {
        return new IdentifierNode(name)
    },

    _createFieldNode(name) {
        return new FieldNode(name)
    },

    _createDataNode(data) {
        return new DataNode(data)
    },

    _createConstantNode(value) {
        return new ConstantNode(value)
    },

    _createAccessNode(path) {
        return new AccessNode(path)
    },

    _createIfNode(conditionPipelineNode, ifNodes, elseNodes) {
        return new IfNode(conditionPipelineNode, ifNodes, elseNodes)
    },

    _createWithNode(assignNode, pipelineNode, truthyNodes, falsyNodes) {
        return new WithNode(assignNode, pipelineNode, truthyNodes, falsyNodes)
    },

    _createRangeNode(elementToken, indexToken, pipelineNode, truthyNodes, falsyNodes) {
        return new RangeNode(elementToken, indexToken, pipelineNode, truthyNodes, falsyNodes)
    },

    _createBreakNode() {
        return new BreakNode()
    },

    _createContinueNode() {
        return new ContinueNode()
    },

    _createDeclareNode(varToken, pipelineNode) {
        return new DeclareNode(varToken, pipelineNode)
    },
    _createAssignNode(varToken, pipelineNode) {
        return new AssignNode(varToken, pipelineNode)
    },

    _createTemplateNode(templateName, pipelineNode) {
        return new TemplateNode(templateName, pipelineNode)
    },

    _createBlockNode(templateName, pipelineNode, nodes) {
        return new BlockNode(templateName, pipelineNode, nodes)
    },

    _advanceToNonWhitespace() {
        this.pos++
        for (;this.pos <= this.tokens.length && (this.tokens[this.pos].kind === TemplateLexer.TokenKind.WHITESPACE || this.tokens[this.pos].kind === TemplateLexer.TokenKind.COMMENT); this.pos++) {}
    },

    _advanceToNext(tokenKind) {
        this.pos++
        for (;this.pos <= this.tokens.length && this.tokens[this.pos].kind !== tokenKind && this.tokens[this.pos].kind !== TemplateLexer.TokenKind.EOF; this.pos++) {}
    },

    /**
     * 
     * @param {Token} token 
     * @param  {...TemplateLexer.TokenKind[keyof TemplateLexer.TokenKind]} expectedTokenKinds 
     */
    _expectTokenKind(token, ...expectedTokenKinds) {
        const tokenKind = token?.kind ?? TemplateLexer.TokenKind.EOF
        for (let i = 0; i < expectedTokenKinds.length; i++) {
            if (tokenKind === expectedTokenKinds[i]) {
                return true
            }
        }
        return false
    },

    _peekToNonWhitespace() {
        let i = this.pos + 1
        for (;i <= this.tokens.length && (this.tokens[i].kind === TemplateLexer.TokenKind.WHITESPACE || this.tokens[this.pos].kind === TemplateLexer.TokenKind.COMMENT); i++) {}
        if (i >= this.tokens.length || this.tokens[i].kind === TemplateLexer.TokenKind.WHITESPACE || this.tokens[this.pos].kind === TemplateLexer.TokenKind.COMMENT || this.tokens[i].kind === TemplateLexer.TokenKind.EOF) {
            return null
        }
        return {
            pos: i,
            token: this.tokens[i]
        }
    },

    /**
     * @param {string} err 
     * @param {Token} [token] 
     */
    _emitError(err, token) {
        this.errors.push({
            message: err,
            token: token ?? this.tokens[this.pos]
        })
    }
}

/**
 * @param {string} data 
 */
function DataNode(data) {
    this.data = data
}
DataNode.prototype = {
    executeS() {
        return this.data
    }
}

/**
 * @param {string} name 
 */
function FieldNode(name) {
    this.name = name
}
FieldNode.prototype = {
    eval(current) {
        if (current == null || current === undefined) {
            return undefined
        }
        return current[this.name]
    }
}

/**
 * @param {name} name 
 */
function IdentifierNode(name) {
    this.name = name
}
IdentifierNode.prototype = {
    /**
     * @param {ScopeStack} stack 
     */
    evalStack(stack) {
        return stack.getVariable(this.name)
    },
}

function ContextNode() {}
ContextNode.prototype = {
    /**
     * @param {ScopeStack} stack 
     */
    evalStack(stack) {
        return stack.getDot()
    }
}

/**
 * 
 * @param {Token} varToken 
 * @param {PipelineNode} pipelineNode 
 */
function DeclareNode(varToken, pipelineNode) {
    this.varToken = varToken
    this.pipelineNode = pipelineNode
}
DeclareNode.prototype = {
    /**
     * @param {ScopeStack} stack 
     */
    eval(stack) {
        stack.defineVariable(this.varToken.value, this.pipelineNode.eval(stack))
    },
    /**
     * @param {ScopeStack} stack 
     */
    executeS(stack) {
        this.eval(stack)
        return ''
    }
}
/**
 * 
 * @param {Token} varToken 
 * @param {PipelineNode} pipelineNode 
 */
function AssignNode(varToken, pipelineNode) {
    this.varToken = varToken
    this.pipelineNode = pipelineNode
}
AssignNode.prototype = {
    /**
     * @param {ScopeStack} stack 
     */
    eval(stack) {
        stack.setVariable(this.varToken.value, this.pipelineNode.eval(stack))
    },
    /**
     * @param {ScopeStack} stack 
     */
    executeS(stack) {
        this.eval(stack)
        return ''
    }
}

/** @typedef {{ eval: (stack: ScopeStack) => any, execute: (stack: ScopeStack, args: any[]) => any }} ValueNode */

function PipelineNode() {
    /** @type {ValueNode[]} */
    this.args = []
    /** @type {ValueNode[][]} */
    this.pipes = []
}
PipelineNode.prototype = {
    /**
     * @param {ValueNode[]} args 
     * @returns {PipelineNode}
     */
    pushArgs(args) {
        this.pipes.push(args)
        return this
    },

    /**
     * @param {ScopeStack} stack 
     */
    eval(stack, pipedValue) {
        let piping = pipedValue
        for (let i = 0; i < this.pipes.length; i++) {
            const currentPipe = this.pipes[i]
            let argValues = []
            for (let j = 1; j < currentPipe.length; j++) {
                argValues.push(currentPipe[j].eval(stack))
            }
            if (piping !== undefined) {
                argValues.push(piping)
            }
            piping = currentPipe[0].execute(stack, argValues)
        }

        return piping
    },

    executeS(stack) {
        return Template.stringOf(this.eval(stack))
    }
}

/**
 * @param {unknown} value 
 */
function ConstantNode(value) {
    this.value = value
}
ConstantNode.prototype = {
    eval() {
        return this.value
    },

    execute() {
        return this.value
    }
}

/**
 * 
 * @param {[ContextNode | IdentifierNode, ...FieldNode[]]} path 
 */
function AccessNode(path) {
    this.path = path
}
AccessNode.prototype = {
    /**
     * @param {ScopeStack} stack 
     */
    eval(stack) {
        const [context, ...fields] = this.path
        let current = context.evalStack(stack)
        for (let i = 0; i < fields.length; i++) {
            current = fields[i].eval(current)
        }
        return current
    },

    execute(stack, args) {
        const value = this.eval(stack)
        if (typeof value === 'function') {
            return value.apply(value, args)
        }
        return value
    }
}

/**
 * 
 * @param {PipelineNode} conditionPipelineNode 
 * @param {RootTemplateNode[]} ifNodes 
 * @param {RootTemplateNode[]} elseNodes 
 */
function IfNode(conditionPipelineNode, ifNodes, elseNodes) {
    this.conditionPipelineNode = conditionPipelineNode
    this.ifNodes = ifNodes
    this.elseNodes = elseNodes
}
IfNode.prototype = {
    /**
     * @param {ScopeStack} stack 
     */
    executeS(stack) {
        const value = this.conditionPipelineNode.eval(stack)
        let nodeList = this.ifNodes
        if (!Template.isTrue(value)) {
            nodeList = this.elseNodes
        }
        let out = ''
        for (let i = 0; i < nodeList.length; i++) {
            out += nodeList[i].executeS(stack)
            if (stack.getMark()) {
                return out
            }
        }
        return out
    }
}

/**
 * 
 * @param {AssignNode | undefined} assignNode 
 * @param {PipelineNode} pipelineNode 
 * @param {RootTemplateNode[]} truthyNodes 
 * @param {RootTemplateNode[] | undefined} falsyNodes 
 * @returns 
 */
function WithNode(assignNode, pipelineNode, truthyNodes, falsyNodes) {
    this.assignNode = assignNode
    this.pipelineNode = pipelineNode
    this.truthyNodes = truthyNodes
    this.falsyNodes = falsyNodes
}
WithNode.prototype = {
    /**
     * 
     * @param {RootTemplateNode[]} nodeList 
     * @param {ScopeStack} stack 
     * @returns 
     */
    _evalNodes(nodeList, stack) {
        let out = ''
        for (let i = 0; i < nodeList.length; i++) {
            out += nodeList[i].executeS(stack)
            if (stack.getMark()) {
                return out
            }
        }
        return out
    },
    /**
     * @param {ScopeStack} stack 
     */
    eval(stack) {
        if (this.assignNode !== undefined) {
            stack.push(undefined)
            this.assignNode.eval(stack)
            const out = this._evalNodes(this.truthyNodes, stack)
            stack.pop()
            return out
        } else if (this.pipelineNode !== undefined) {
            const value = this.pipelineNode.eval(stack)
            let nodeList = this.truthyNodes
            if (!Template.isTrue(value)) {
                nodeList = this.falsyNodes
            }
            if (nodeList) {
                stack.push(value)
                const out = this._evalNodes(nodeList, stack)
                stack.pop()
                return out
            }
            return ''
        }
        throw new Error("invalid with node")
    },
    /**
     * @param {ScopeStack} stack 
     */
    executeS(stack) {
        return this.eval(stack)
    }
}

/**
 * 
 * @param {Token | undefined} elementToken 
 * @param {Token | undefined} indexToken 
 * @param {PipelineNode} pipelineNode 
 * @param {RootTemplateNode[]} truthyNodes 
 * @param {RootTemplateNode[]} falsyNodes 
 */
function RangeNode(elementToken, indexToken, pipelineNode, truthyNodes, falsyNodes) {
    this.elementToken = elementToken
    this.indexToken = indexToken
    this.pipelineNode = pipelineNode
    this.truthyNodes = truthyNodes
    this.falsyNodes = falsyNodes
}
RangeNode.prototype = {
    /**
     * @param {ScopeStack} stack 
     */
    executeS(stack) {
        const obj = this.pipelineNode.eval(stack)
        if (!Template.isTrue(obj)) {
            let out = ''
            for (let i = 0; i < this.falsyNodes.length; i++) {
                out += this.falsyNodes[i].executeS(stack)
            }
            return out
        }
        let out = ''
        let keys = undefined
        let isLoopRunning = i => i < obj.length
        let getObjItem = i => obj[i]
        let getObjKey = i => i
        if (!Array.isArray(obj) && typeof obj !== 'string') {
            keys = Object.keys(obj)
            keys.sort()
            isLoopRunning = i => i < keys.length
            getObjItem = i => obj[keys[i]]
            getObjKey = i => keys[i]
        }
        range: for (let i = 0; isLoopRunning(i); i++) {
            const element = getObjItem(i)
            const key = getObjKey(i)
            stack.push(element)
            if (this.elementToken !== undefined) {
                stack.defineVariable(this.elementToken.value, element)
                if (this.indexToken !== undefined) {
                    stack.defineVariable(this.indexToken.value, key)
                }
            }

            for (let j = 0; j < this.truthyNodes.length; j++) {
                out += this.truthyNodes[j].executeS(stack)
                const mark = stack.getMark()
                if (mark === 'continue') {
                    stack.clearMark()
                    break
                }
                if (mark === 'break') {
                    stack.clearMark()
                    stack.pop()
                    break range
                }
            }

            stack.pop()
        }
        return out
    }
}

function BreakNode() {}
BreakNode.prototype = {
    /**
     * @param {ScopeStack} stack 
     */
    eval(stack) {
        stack.markBreak()
    },
    /**
     * @param {ScopeStack} stack 
     */
    executeS(stack) {
        this.eval(stack)
        return ''
    }
}
function ContinueNode() {}
ContinueNode.prototype = {
    /**
     * @param {ScopeStack} stack 
     */
    eval(stack) {
        stack.markContinue()
    },
    /**
     * @param {ScopeStack} stack 
     */
    executeS(stack) {
        this.eval(stack)
        return ''
    }
}

/**
 * @param {string} templateName 
 * @param {PipelineNode | undefined} pipelineNode 
 */
function TemplateNode(templateName, pipelineNode) {
    this._blockNode = new BlockNode(templateName, pipelineNode, undefined)
}
TemplateNode.prototype = {
    /**
     * @param {ScopeStack} stack 
     */
    eval(stack) {
        return this._blockNode.eval(stack)
    },
    /**
     * @param {ScopeStack} stack 
     */
    executeS(stack) {
        return this.eval(stack)
    }
}

/**
 * 
 * @param {string} templateName 
 * @param {PipelineNode} pipelineNode 
 * @param {RootTemplateNode[]} nodes 
 */
function BlockNode(templateName, pipelineNode, nodes) {
    this.templateName = templateName
    this.pipelineNode = pipelineNode
    this.nodes = nodes
}
BlockNode.prototype = {
    /**
     * 
     * @param {RootTemplateNode[]} nodeList 
     * @param {ScopeStack} stack 
     * @returns 
     */
    _evalNodes(nodeList, stack) {
        let out = ''
        for (let i = 0; i < nodeList.length; i++) {
            out += nodeList[i].executeS(stack)
            if (stack.getMark()) {
                return out
            }
        }
        return out
    },
    /**
     * @param {ScopeStack} stack 
     */
    eval(stack) {
        let value = null
        if (this.pipelineNode) {
            value = this.pipelineNode.eval(stack)
        }
        let nodeList = stack.getTemplateNodes(this.templateName)
        if (!nodeList) {
            nodeList = this.nodes
        }
        if (nodeList) {
            stack.push(value)
            const out = this._evalNodes(nodeList, stack)
            stack.pop()
            return out
        }
        return ''
    },
    /**
     * @param {ScopeStack} stack 
     */
    executeS(stack) {
        return this.eval(stack)
    }
}

/**
 * 
 * @param {Record<string, RootTemplateNode[]>} templates 
 */
function Template(templates) {
    this.templates = templates
    this.variablesContext = {}
    this._setupDefaultFuncs()
}

Template.mustParse = function(src) {
    const { tokens, errors } = TemplateLexer.lex(src)
    if (errors.length > 0) {
        const err = new Error('Failed to tokenize template')
        err.errors = errors
        throw err
    }
    const parser = TemplateParser.parse(src, tokens)
    if (parser.errors.length > 0) {
        const err = new Error('Failed to parse template')
        err.errors = parser.errors
        throw err
    }
    return new Template(parser.templates)
}

Template.isTrue = function(value) {
    if (Array.isArray(value) || typeof value === 'string') {
        return value.length > 0
    }
    if (value instanceof Map) {
        return value.size > 0
    }
    return !!value
}

Template.stringOf = function(obj) {
    if (obj === null || obj === undefined) return ''
    return `${obj}`
}

Template.prototype = {
    _setupDefaultFuncs() {
        this.withFuncs({
            "and": (...args) => {
                for (let i = 0; i < args.length; i++) {
                    if (!Template.isTrue(args[i])) {
                        return args[i]
                    }
                }
                return args[args.length - 1]
            },
            "or": (...args) => {
                for (let i = 0; i < args.length; i++) {
                    if (Template.isTrue(args[i])) {
                        return args[i]
                    }
                }
                return args[args.length - 1]
            },
            "not": b => !Template.isTrue(b),
            "eq": (...args) => {
                if (args.length < 2) {
                    throw new Error("eq requires at least 2 arguments")
                }
                for (let i = 1; i < args.length; i++) {
                    if (args[0] === args[i]) {
                        return true
                    }
                }
                return false
            },
            "ne": (a, b) => a !== b,
            "lt": (a, b) => a < b,
            "le": (a, b) => a <= b,
            "gt": (a, b) => a > b,
            "ge": (a, b) => a >= b,
            "index": (a, i) => {
                if (Array.isArray(a)) {
                    if (typeof i !== 'number' || isNaN(i)) {
                        throw new Error("cannot index array with " + i)
                    }
                    if (i < 0) {
                        return a[a.length - i]
                    }
                    return a[i]
                }
                if (a === null || a === undefined) {
                    throw new Error("cannot index " + a)
                }
                return a[i]
            },
            "slice": (arr, start, end) => {
                if (!Array.isArray(arr) && typeof arr !== 'string') {
                    throw new Error("cannot slice " + arr)
                }
                return arr.slice(start, end)
            },
            "len": a => {
                if (typeof a === 'string' || Array.isArray(a)) {
                    return a.length
                }
                if (a instanceof Map) {
                    return a.size
                }
                return 0
            },
            "html": (...args) => {
                if (args.length !== 1) {
                    throw new Error('expected 1 argument')
                }
                let str = args[0]
                if (typeof str !== 'string') {
                    str = Template.stringOf(str)
                }
                return str
                    .replaceAll('&', '&amp;')
                    .replaceAll('<', '&lt;')
                    .replaceAll('>', '&gt;')
                    .replaceAll('"', '&quot;')
                    .replaceAll("'", '&#039;')
            },
            "json": obj => JSON.stringify(obj),
            "urlquery": str => encodeURIComponent(str),
            "log": (...args) => console.log(...args)
        })
    },
    withFuncs(funcMap) {
        for (let k in funcMap) {
            if (typeof funcMap[k] === 'function') {
                this.variablesContext[k] = funcMap[k]
            }
        }
        return this
    },
    sExecute(contextData) {
        let out = ''
        const stack = new ScopeStack(contextData, this.variablesContext, this.templates)
        const nodes = stack.getTemplateNodes(TemplateParser.ROOT_TEMPLATE)
        for (let i = 0; i < nodes.length; i++) {
            out += nodes[i].executeS(stack)
        }
        return out
    }
}

function ScopeStack(initialDot, initialVariables, templates) {
    this._stack = [this._newScope(initialDot, initialVariables, true)]
    this._templates = templates
    this._mark = null
}
ScopeStack.prototype = {
    _newScope(dot, variables, newRoot) {
        const vars = Object.assign({}, variables)
        if (newRoot) {
            vars['$'] = dot
        }
        return {
            dot: dot,
            variables: vars,
        }
    },

    getTemplateNodes(templateName) {
        return this._templates[templateName]
    },

    getVariable(name) {
        for (let i = this._stack.length - 1; i >= 0; i--) {
            if (name in this._stack[i].variables) {
                return this._stack[i].variables[name]
            }
        }
        throw new Error("undefined variable " + name)
    },

    getDot() {
        for (let i = this._stack.length - 1; i >= 0; i--) {
            const val = this._stack[i].dot
            if (val !== undefined) {
                return val
            }
        }
        return undefined
    },

    getMark() {
        return this._mark
    },

    _getVariableStackIndex(name) {
        for (let i = this._stack.length - 1; i >= 0; i--) {
            if (name in this._stack[i].variables) {
                return i
            }
        }
        return -1
    },

    defineVariable(name, value) {
        const stackIndex = this._getVariableStackIndex(name)
        if (stackIndex === this._stack.length - 1) {
            throw new Error(`already defined variable ${name}`)
        }
        this._stack[this._stack.length - 1].variables[name] = value
    },

    setVariable(name, value) {
        const stackIndex = this._getVariableStackIndex(name)
        if (stackIndex === -1) {
            throw new Error(`undefined variable ${name}`)
        }
        this._stack[stackIndex].variables[name] = value
    },

    markBreak() {
        this._mark = 'break'
    },
    markContinue() {
        this._mark = 'continue'
    },

    clearMark() {
        this._mark = null
    },

    push(dotValue, newRoot = false) {
        this._stack.push(this._newScope(dotValue, newRoot))
    },

    pop() {
        this._stack.pop()
    }
}
