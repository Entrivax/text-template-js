/**
 * @typedef {{stringKind: Lexer.TokenKind[keyof Lexer.TokenKind], value: string, pos: number, line: number, col: number, kind: number}} Token
 **/

/**
 * 
 * @param {string} src 
 */
function Lexer(src) {
    this.src = src
    this.pos = 0
    this.line = 0
    this.col = 0
    /** @type {Token[]} */
    this.tokens = []
    this.errors = []
}

Lexer.TokenKind = {
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
    COMMENT_START: Symbol("COMMENT_START"),
    COMMENT_END: Symbol("COMMENT_END"),
    COMMENT_CONTENT: Symbol("COMMENT_CONTENT"),
    WHITESPACE: Symbol("WHITESPACE"),
    DOT: Symbol("DOT"),
    DECLARE: Symbol("DECLARE"),
    EQUAL: Symbol("EQUAL"),
    COMMA: Symbol("COMMA"),
    ACTION_START: Symbol("ACTION_START"),
    ACTION_END: Symbol("ACTION_END"),
}

Lexer.enumify = function(enu) {
    const keys = Object.keys(enu)
    for (let i = 0; i < keys.length; i++) {
        if (!isNaN(+keys[i])) {
            continue
        }
        const val = enu[keys[i]]
        enu[val] = keys[i]
    }
}

Lexer.enumify(Lexer.TokenKind)

Lexer.Chars = {
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
    COMMA: ","
}

Lexer.ReservedKeywords = new Set([
    "if",
    "else",
    "end",
    "range",
    "break",
    "continue",
    "template",
    "block",
    "with",
])

Lexer.lex = function(src) {
    const lexer = new Lexer(src)
    lexer.lex()
    return { tokens: lexer.tokens, errors: lexer.errors }
}

Lexer.prototype = {
    lex() {
        let trimNext = false
        for (;this.pos < this.src.length;) {
            if (this._isStartingAction()) {
                trimNext = this._handleAction()
                continue
            }
            this._handleData(trimNext)
        }

        this.tokens.push(this._createToken(Lexer.TokenKind.EOF, "", this.pos, this.line, this.col))
    },

    _isStartingAction() {
        return this._peekSeq(Lexer.Chars.ACTION_DELIMITER_START)
    },

    _getEndingAction() {
        const hasTrimChar = this.src[this.pos] === Lexer.Chars.ACTION_DELIMITER_TRIM
        const isEndingAction = this.src.slice(this.pos + +hasTrimChar, this.pos + +hasTrimChar + Lexer.Chars.ACTION_DELIMITER_START.length) === Lexer.Chars.ACTION_DELIMITER_END
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
                if (this.src[this.pos + Lexer.Chars.ACTION_DELIMITER_START.length] === Lexer.Chars.ACTION_DELIMITER_TRIM) {
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
            this.tokens.push(this._createToken(Lexer.TokenKind.DATA, buffer, startPos, startLine, startCol))
        }
    },

    _handleAction() {
        this.tokens.push(this._createToken(Lexer.TokenKind.ACTION_START, '', this.pos, this.line, this.col))
        this._advanceN(Lexer.Chars.ACTION_DELIMITER_START.length)
        if (this.src[this.pos] === Lexer.Chars.ACTION_DELIMITER_TRIM) {
            this._advance()
        }
        let trimNextDataBlock = false

        for (;this.pos < this.src.length;) {
            const actionEnding = this._getEndingAction()
            if (actionEnding.isEndingAction) {
                if (actionEnding.hasTrimChar) {
                    trimNextDataBlock = true
                }
                this.tokens.push(this._createToken(Lexer.TokenKind.ACTION_END, '', this.pos, this.line, this.col))
                this._advanceN(Lexer.Chars.ACTION_DELIMITER_END.length + +actionEnding.hasTrimChar)
                break
            }

            if (this._isWhitespace(this.src[this.pos])) {
                this._handleWhitespace()
                continue
            }
            if (this._peekSeq(Lexer.Chars.COMMENT_START)) {
                this._handleComment()
                continue
            }
            if (this._peekSeq(Lexer.Chars.STRING_DELIM)) {
                this._handleString()
                continue
            }
            if (this._handleSimple('(', Lexer.TokenKind.PAREN_OPEN) ||
                this._handleSimple(')', Lexer.TokenKind.PAREN_CLOSE) ||
                this._handleSimple(Lexer.Chars.COMMA, Lexer.TokenKind.COMMA) ||
                this._handleSimple(Lexer.Chars.DECLARE, Lexer.TokenKind.DECLARE) ||
                this._handleSimple(Lexer.Chars.EQUAL, Lexer.TokenKind.EQUAL) ||
                this._handleSimple(Lexer.Chars.DOT, Lexer.TokenKind.DOT) ||
                this._handleSimple(Lexer.Chars.PIPE, Lexer.TokenKind.PIPE)) {
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
            this.tokens.push(this._createToken(tokenKind, seq, startPos, startLine, startCol))
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

        this.tokens.push(this._createToken(Lexer.TokenKind.WHITESPACE, buffer, startPos, startLine, startCol))
    },

    _handleString() {
        const startLine = this.line
        const startCol = this.col
        const startPos = this.pos
        let buffer = ''
        this._advanceN(Lexer.Chars.STRING_DELIM.length)
        for (;this.pos < this.src.length;) {
            if (this._peekSeq('\\')) {
                this._advance()
                const c = this.src[this.pos]
                switch (c) {
                case 'n':
                    buffer += '\n'
                    break
                case 'r':
                    buffer += '\r'
                    break
                case 't':
                    buffer += '\t'
                    break
                case Lexer.Chars.STRING_DELIM:
                    buffer += Lexer.Chars.STRING_DELIM
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
                    this.tokens.push(this._createToken(Lexer.TokenKind.STRING, buffer, startPos, startLine, startCol))
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
                this.tokens.push(this._createToken(Lexer.TokenKind.STRING, buffer, startPos, startLine, startCol))
                return
            }
            if (this._peekSeq(Lexer.Chars.STRING_DELIM)) {
                this._advance()
                this.tokens.push(this._createToken(Lexer.TokenKind.STRING, buffer, startPos, startLine, startCol))
                return
            }
            buffer += c
            this._advance()
        }
        this._emitError('unfinished string')
        this.tokens.push(this._createToken(Lexer.TokenKind.STRING, buffer, startPos, startLine, startCol))
    },

    _handleComment() {
        this.tokens.push(this._createToken(Lexer.TokenKind.COMMENT_START, Lexer.Chars.COMMENT_START, this.pos, this.line, this.col))
        this._advanceN(Lexer.Chars.COMMENT_START.length)
        const startLine = this.line
        const startCol = this.col
        const startPos = this.pos
        let buffer = ''
        for (;this.pos < this.src.length;) {
            if (this._peekSeq(Lexer.Chars.COMMENT_END)) {
                this.tokens.push(this._createToken(Lexer.TokenKind.COMMENT_CONTENT, buffer, startPos, startLine, startCol))
                this._advanceN(Lexer.Chars.COMMENT_END.length)
                this.tokens.push(this._createToken(Lexer.TokenKind.COMMENT_END, Lexer.Chars.COMMENT_END, this.pos, this.line, this.col))
                return
            }
            buffer += this.src[this.pos]
            this._advance()
        }
        // Uh oh, template ended before the comment was closed
        this.tokens.push(this._createToken(Lexer.TokenKind.COMMENT_CONTENT, buffer, startPos, startLine, startCol))
    },

    _peekIdentifierOrKeyword() {
        const currentChar = this.src[this.pos]
        return (currentChar >= 'a' && currentChar <= 'z') || (currentChar >= 'A' && currentChar <= 'Z') || currentChar === "_" || currentChar === Lexer.Chars.VARIABLE_PREFIX || currentChar === Lexer.Chars.DOT
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
                (currentChar === "_") || (currentChar === Lexer.Chars.VARIABLE_PREFIX)
            ) {
                identifier += currentChar
                this._advance()
            } else {
                break
            }
        }

        if (identifier.length > 0) {
            this.tokens.push(this._createToken(depth === 0 && Lexer.ReservedKeywords.has(identifier) ? Lexer.TokenKind.KEYWORD : Lexer.TokenKind.IDENTIFIER, identifier, startPos, startLine, startCol))
        }
    },

    _peekNumber() {
        const currentChar = this.src[this.pos]
        return currentChar >= '0' && currentChar <= '9'
    },

    _handleNumber() {
        let startLine = this.line
        let startCol = this.col
        let startPos = this.pos
        let number = ''
        for (;this.pos < this.src.length;) {
            const currentChar = this.src[this.pos]
            if (currentChar >= '0' && currentChar <= '9' || (currentChar === '.' && number.indexOf('.') === -1)) {
                number += currentChar
                this._advance()
            } else {
                break
            }
        }
        this.tokens.push(this._createToken(Lexer.TokenKind.NUMBER, number, startPos, startLine, startCol))
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

    /**
     * 
     * @param {Symbol} kind 
     * @param {string} value 
     * @param {number} pos 
     * @param {number} line 
     * @param {number} col 
     * @returns {Token}
     */
    _createToken(kind, value, pos, line, col) {
        return {
            stringKind: kind.description, value, pos, line, col, kind,
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
function Parser(src, tokens) {
    this.src = src
    this.tokens = tokens
    /** @type {Node[]} */
    this.nodes = []
    this.pos = 0
    this.errors = []
}

/** @typedef {{ executeS: (contextData: ScopeStack) => string }} RootTemplateNode */

/**
 * @param {string} src
 * @param {Token[]} tokens
 */
Parser.parse = function(src, tokens) {
    const parser = new Parser(src, tokens)
    parser.parse()
    return parser
}

Parser.prototype = {
    parse() {
        this._parseNodes(this.nodes)
    },

    /**
     * @param {Node[]} nodes 
     */
    _parseNodes(nodes, stopAtElseEnd = false) {
        for (;this.pos <= this.tokens.length && this.tokens[this.pos].kind !== Lexer.TokenKind.EOF;) {
            const token = this.tokens[this.pos]
            if (token.kind === Lexer.TokenKind.DATA) {
                nodes.push(this._createDataNode(token.value))
                this.pos++
                continue
            }
            if (token.kind === Lexer.TokenKind.ACTION_START) {
                const pipelineNode = this._parseAction(stopAtElseEnd)
                if (pipelineNode) {
                    nodes.push(pipelineNode)
                }
                continue
            }
            if (token.kind === Lexer.TokenKind.ACTION_END) {
                this.pos++
                continue
            }

            if (stopAtElseEnd && token.kind === Lexer.TokenKind.KEYWORD && (token.value === 'end' || token.value === 'else')) {
                return
            }
        }
    },

    _parseAction() {
        this._advanceToNonWhitespace()

        for (;this.pos <= this.tokens.length;) {
            const token = this.tokens[this.pos]
            switch (token.kind) {
            case Lexer.TokenKind.ACTION_END:
                return
            case Lexer.TokenKind.EOF:
                this._emitError("unexpected EOF")
                return
            case Lexer.TokenKind.KEYWORD:
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
                    this._emitError("unexpected break")
                    return
                case 'continue':
                    this._emitError("unexpected continue")
                    return
                }
                // TODO: Handle keywords
                this.pos++
                break

            case Lexer.TokenKind.IDENTIFIER:
                const currentPos = this.pos
                const result = this._tryParseAssign()
                if (!result.success && !result.error) {
                    this.pos = currentPos
                    return this._parsePipeline()
                }

                break
            default:
                return this._parsePipeline()
            }
        }
    },

    /*
{ stringKind: "DATA", value: "Hello ", pos: 0, … }
​{ stringKind: "ACTION_START", pos: 6, line: 0, … }
​{ stringKind: "WHITESPACE", value: " ", pos: 8, … }
​{ stringKind: "KEYWORD", value: "if", pos: 9, … }
​{ stringKind: "WHITESPACE", value: " ", pos: 11, … }
​{ stringKind: "IDENTIFIER", value: "trim", pos: 12, … }
​{ stringKind: "WHITESPACE", value: " ", pos: 16, … }
​{ stringKind: "DOT", value: ".", pos: 17, … }
​{ stringKind: "IDENTIFIER", value: "Name", pos: 18, … }
​{ stringKind: "WHITESPACE", value: " ", pos: 22, … }
​​{ stringKind: "ACTION_END", pos: 23, line: 0, … }
​​{ stringKind: "ACTION_START", pos: 25, line: 0, … }
​​{ stringKind: "WHITESPACE", value: " ", pos: 27, … }
​​{ stringKind: "DOT", value: ".", pos: 28, … }
​​{ stringKind: "IDENTIFIER", value: "Name", pos: 29, … }
​​{ stringKind: "WHITESPACE", value: " ", pos: 33, … }
​​{ stringKind: "ACTION_END", pos: 34, line: 0, … }
​​{ stringKind: "ACTION_START", pos: 45, line: 1, … }
​​{ stringKind: "WHITESPACE", value: " ", pos: 48, … }
​​{ stringKind: "KEYWORD", value: "else", pos: 49, … }
​​{ stringKind: "WHITESPACE", value: " ", pos: 53, … }
​​{ stringKind: "ACTION_END", pos: 54, line: 1, … }
​​{ stringKind: "DATA", value: "World", pos: 56, … }
​​{ stringKind: "ACTION_START", pos: 61, line: 1, … }
​​{ stringKind: "WHITESPACE", value: " ", pos: 63, … }
​​{ stringKind: "KEYWORD", value: "end", pos: 64, … }
​​{ stringKind: "WHITESPACE", value: " ", pos: 67, … }
​​{ stringKind: "ACTION_END", pos: 68, line: 1, … }
​​{ stringKind: "DATA", value: "!", pos: 70, … }
​​{ stringKind: "EOF", pos: 71, line: 1, … }
*/
    _parseIf() {
        this.pos++
        const ifNodes = []
        const elseNodes = []
        const conditionNode = this._parsePipeline()

        if (this.tokens[this.pos].kind !== Lexer.TokenKind.ACTION_END) {
            this._advanceToNext(Lexer.TokenKind.ACTION_END)
        }
        this.pos++
        this._parseNodes(ifNodes, true)
        if (this.tokens[this.pos].kind === Lexer.TokenKind.KEYWORD) {
            if (this.tokens[this.pos].value === 'else') {
                this._advanceToNonWhitespace()
                if (this.tokens[this.pos].kind === Lexer.TokenKind.KEYWORD && this.tokens[this.pos].value === 'if') {
                    elseNodes.push(this._parseIf())
                } else {
                    if (this.tokens[this.pos].kind !== Lexer.TokenKind.ACTION_END) {
                        this._advanceToNext(Lexer.TokenKind.ACTION_END)
                    }
                    this.pos++
                    this._parseNodes(elseNodes, true)
                }
            }

            if (this.tokens[this.pos].value === 'end') {
                this._advanceToNext(Lexer.TokenKind.ACTION_END)
                if (this.tokens[this.pos].kind !== Lexer.TokenKind.ACTION_END) {
                    this._advanceToNext(Lexer.TokenKind.ACTION_END)
                }
                this.pos++
            }
        }

        return this._createIfNode(conditionNode, ifNodes, elseNodes)
    },

    _tryParseAssign() {
        const varToken = this.tokens[this.pos]
        if (varToken.value[0] !== '$') {
            return { success: false }
        }
        this._advanceToNonWhitespace()
        let declareNew = null
        if (varToken.kind === Lexer.TokenKind.EQUAL) {
            declareNew = false
        } else if (varToken.kind === Lexer.TokenKind.DECLARE) {
            declareNew = true
        }
        if (declareNew === null) {
            this._emitError("unexpected token " + varToken.kind)
            return { success: false, error: true }
        }
        const pipelineNode = this._parsePipeline()
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

        parsingLoop: for (;this.pos <= this.tokens.length && this.tokens[this.pos].kind !== Lexer.TokenKind.EOF;) {
            const token = this.tokens[this.pos]
            switch (token.kind) {
            case Lexer.TokenKind.DOT:
            case Lexer.TokenKind.IDENTIFIER:
                const path = this._parsePipelinePath()
                args.push(this._createAccessNode(path))
                break
            case Lexer.TokenKind.PAREN_OPEN:
                this.pos++
                this.args.push(this._parsePipeline())
                break
            case Lexer.TokenKind.PAREN_CLOSE:
                this.pos++
                break parsingLoop
            case Lexer.TokenKind.PIPE:
                this.pos++
                pipeline.pushArgs(args)
                args = []
                break
            case Lexer.TokenKind.STRING:
                this.pos++
                this.args.push(this._createConstantNode(token.value))
                break
            case Lexer.TokenKind.BOOL:
                this.pos++
                this.args.push(this._createConstantNode(token.value === "true"))
                break
            case Lexer.TokenKind.NUMBER:
                this.pos++
                this.args.push(this._createConstantNode(+token.value))
                break
            case Lexer.TokenKind.NIL:
                this.pos++
                this.args.push(this._createConstantNode(null))
                break
            case Lexer.TokenKind.ACTION_END:
                break parsingLoop
            case Lexer.TokenKind.COMMENT_START:
                this._parseComment()
                break
            case Lexer.TokenKind.KEYWORD:
                break parsingLoop
            case Lexer.TokenKind.ACTION_START:
                this._emitError("unexpected action start")
                return
            case Lexer.TokenKind.WHITESPACE:
                this.pos++
                break
            }
        }
        return pipeline.pushArgs(args)
    },

    _parsePipelinePath() {
        const pathNodes = [this.tokens[this.pos].kind === Lexer.TokenKind.IDENTIFIER ? this._createIdentifierNode(this.tokens[this.pos].value) : this._createContextNode()]
        let lastIsDot = this.tokens[this.pos].kind === Lexer.TokenKind.DOT
        this.pos++
        parsingLoop: for (;this.pos <= this.tokens.length && this.tokens[this.pos].kind !== Lexer.TokenKind.EOF;) {
            const token = this.tokens[this.pos]
            switch (token.kind) {
            case Lexer.TokenKind.DOT:
                if (lastIsDot) {
                    this._emitError("unexpected dot")
                    break parsingLoop
                }
                lastIsDot = true
                break
            case Lexer.TokenKind.IDENTIFIER:
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
        if (pathNodes.length > 1 && lastIsDot) {
            this._emitError("unexpected dot at the end of path")
        }
        return pathNodes
    },

    _parseComment() {
        for (;this.pos <= this.tokens.length && this.tokens[this.pos].kind !== Lexer.TokenKind.EOF;) {
            const token = this.tokens[this.pos]
            switch (token.kind) {
            case Lexer.TokenKind.COMMENT_START:
            case Lexer.TokenKind.COMMENT_CONTENT:
                this.pos++
                break
            case Lexer.TokenKind.COMMENT_END:
                this.pos++
                return
            default:
                this._emitError("unexpected token " + token.stringKind)
                break
            }
        }
        this._emitError("comment node not ended")
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

    _advanceToNonWhitespace() {
        this.pos++
        for (;this.pos <= this.tokens.length && this.tokens[this.pos].kind === Lexer.TokenKind.WHITESPACE && this.tokens[this.pos].kind !== Lexer.TokenKind.EOF; this.pos++) {}
    },

    _advanceToNext(tokenKind) {
        this.pos++
        for (;this.pos <= this.tokens.length && this.tokens[this.pos].kind !== tokenKind && this.tokens[this.pos].kind !== Lexer.TokenKind.EOF; this.pos++) {}
    },

    _peekToNonWhitespace() {
        let i = this.pos + 1
        for (;i <= this.tokens.length && this.tokens[i].kind === Lexer.TokenKind.WHITESPACE && this.tokens[i].kind !== Lexer.TokenKind.EOF; i++) {}
        if (i >= this.tokens.length || this.tokens[i].kind === Lexer.TokenKind.WHITESPACE || this.tokens[i].kind !== Lexer.TokenKind.EOF) {
            return null
        }
        return {
            pos: i,
            token: this.tokens[i]
        }
    },
    
    _emitError(err) {
        this.errors.push({
            message: err,
            token: this.tokens[this.pos]
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
    evalPipeline(stack, pipedValue) {
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
        return this.evalPipeline(stack)
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
        return value
    },

    execute() {
        return value
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
        const value = this.conditionPipelineNode.evalPipeline(stack)
        let nodeList = this.ifNodes
        if (!Template._isTrue(value)) {
            nodeList = this.elseNodes
        }
        let out = ''
        for (let i = 0; i < nodeList.length; i++) {
            out += nodeList[i].executeS(stack)
        }
        return out
    }
}

/**
 * 
 * @param {RootTemplateNode[]} nodes 
 */
function Template(nodes) {
    this.nodes = nodes
    this.variablesContext = {}
}

Template.MustParse = function(src) {
    const { tokens, errors } = Lexer.lex(src)
    if (errors.length > 0) {
        throw new Error('Failed to tokenize template', { errors })
    }
    const parser = Parser.parse(src, tokens)
    if (parser.errors.length > 0) {
        throw new Error('Failed to parse template', { errors: parser.errors })
    }
    return new Template(parser.nodes)
}

Template._isTrue = function(value) {
    if (Array.isArray(value) || typeof value === 'string') {
        return value.length > 0
    }
    if (value instanceof Map) {
        return value.size > 0
    }
    return !!value
}

Template.prototype = {
    withFuncs(funcMap) {
        for (let k in funcMap) {
            if (typeof funcMap[k] === 'function') {
                this.variablesContext[k] = funcMap[k]
            }
        }
        return this
    },
    executeS(contextData) {
        let out = ''
        const stack = new ScopeStack(contextData, this.variablesContext)
        for (let i = 0; i < this.nodes.length; i++) {
            out += this.nodes[i].executeS(stack)
        }
        return out
    }
}

function ScopeStack(initialDot, initialVariables) {
    this._stack = [this._newScope(initialDot, initialVariables)]
}
ScopeStack.prototype = {
    _newScope(dot, variables) {
        return {
            dot: dot,
            variables: variables || {},
        }
    },

    getVariable(name) {
        for (let i = this._stack.length - 1; i >= 0; i--) {
            const val = this._stack[i].variables[name]
            if (val !== undefined) {
                return val
            }
        }
        return undefined
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

    push(dotValue) {
        this._stack.push(this._newScope(dotValue))
    },

    pop() {
        this._stack.pop()
    }
}
