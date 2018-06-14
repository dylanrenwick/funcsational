const optionDefinitions = [
	{ name: 'code', alias: 'c', type: Boolean },
	{ name: 'verbose', alias: 'v', type: Boolean },
	{ name: 'src', alias: 's', type: String, multiple: false, defaultOption: true }
];

const fs = require('fs');

const commandLineArgs = require('command-line-args');
const options = commandLineArgs(optionDefinitions);

let code = '';

var builtins  = {
	print: function(msg) {
		console.log(msg);
		return msg;
	}
}
var functions = [
	{
		name: 'print',
		args: ['message'],
		source: '[Native Code]',
		program: [{ type: 'builtin', data: 'print' }, { type: 'arg', data: 'message' }]
	}
];

if (!options.code) {
	code = fs.readFile(options.src, 'utf8', function(err, data) {
		if (err) {
			return console.log(err);
		} else {
			parseCode(data);
		}
	});
} else {
	parseCode(options.src);
}

function parseCode(code) {
	let ast = {
		builtins: builtins,
		functions: functions,
		variables: {}
	};

	if (options.verbose) console.log(code);
	ast.functions = ast.functions.concat(getFuncs(code));
	if (options.verbose) console.log(ast.functions);

	for(let i = 0; i < ast.functions.length; i++) {
		if (ast.functions[i].program) continue;
		ast.functions[i].program = parseFunc(ast.functions[i], ast);
	}

	if (options.verbose) console.log(JSON.stringify(ast.functions, null, 4));

	runCode(ast);
}

function throwParseError(code, lineNum, charNum, error) {
	console.log("Parse error on", lineNum, "at position", charNum);
	let line = getLine(code, lineNum);
	let tabCount = (line.match(/\t/g) || []).length;
	line = line.replace(/\t/g, '    ');
	console.log(line);
	console.log(' '.repeat(charNum + (tabCount * 2)) + '^');
	console.log(error);
	process.exit();
}

function getLine(code, lineNum) {
	return code.split("\n")[lineNum];
}

function getFuncs(code) {
	let symbol = '';
	let regex = /^[a-zA-Z0-9\-_]+\s*\(?$/;
	let inFunc = false;
	let inArgs = false;
	let args = [];
	let bracketCount = 0;
	let funcCode = '';
	let lineCount = 0;
	let funcLine = 0;

	let funcs = [];

	for(let i = 0; i < code.length; i++) {
		if (code[i] == "\n") lineCount++;
		if (!inFunc && !inArgs) {
			symbol += code[i];
			if (regex.test(symbol) === false) {
				if (/^(\s|\n)*$/.test(symbol)) {
					symbol = '';
					continue;
				}
				throwParseError(code, lineCount, i, "Expected `(' but got `" + code[i] + "'");
				symbol = '';
			} else if (symbol.endsWith('(')) {
				inArgs = true;
				funcLine = lineCount;
				regex = /^[a-zA-Z0-9\-_]+\s*[,)]?$/;
				symbol = '';
			}
		} else if (inArgs) {
			if (/\s/.test(code[i]) && symbol == '') continue;
			symbol += code[i];
			if (!regex.test(symbol)) {
				if (symbol == ')') {
					inArgs = false;
					inFunc = true;
					while(code[++i] != '(') {
						if (!/^\s$/.test(code[i])) {
							throwParseError(code, lineCount, i, "Expected `(' but got `" + code[i] + "'");
						}
					}
					symbol = '';
				} else {
					throwParseError(code, lineCount, i, "Expected `,' or `)' but got `" + code[i] + "'");
				}
			} else if (symbol.endsWith(',')) {
				args.push(symbol.substring(0, symbol.length - 1));
				symbol = '';
			} else if (symbol.endsWith(')')) {
				args.push(symbol.substring(0, symbol.length - 1));
				inArgs = false;
				inFunc = true;
				while(code[++i] != '(') {
					if (!/^\s$/.test(code[i])) {
						throwParseError(code, lineCount, i, "Expected `(' but got `" + code[i] + "'");
					}
				}
				symbol = '';
			}
		} else {
			funcCode += code[i];
			if (code[i] == '(') bracketCount++;
			else if (code[i] == ')') {
				if (bracketCount > 0) bracketCount--;
				else {
					funcs.push({
						name: code.substr(0, code.indexOf('(')),
						args: args,
						line: funcLine,
						source: funcCode.substr(0, funcCode.length - 1)
					});
					inArgs = false;
					inFunc = false;

					if (options.verbose) console.log("Found function", funcs[funcs.length - 1].name);

					regex = /^[a-zA-Z0-9\-_]+\s*\(?$/;
				}
			}
		}
	}

	return funcs;
}

function parseFunc(func, programAst) {
	let code = func.source;
	let wsRegex = /^(\s|\n)*$/;
	let funcCallRegex = /[a-zA-Z0-9\-_]/;
	let symbol = '';

	let ast = [];

	let lineCount = func.line;

	for(let i = 0; i < code.length; i++) {
		if (code[i] == "\n") lineCount++;
		if (code[i] == '"' && wsRegex.test(symbol)) {
			symbol = '';
			let exit = false;
			while (!exit && i < code.length) {
				i++;
				let bsString = '';
				if (code[i] == '\\') {
					let backslashCount = 0;
					while(code[i++] == '\\') {
						backslashCount++;
						if (backslashCount % 2 == 0) bsString += '\\';
					}
					symbol += bsString;
					if (backslashCount % 2 != 0) {
						symbol += code[i];
					} else {
						i-=2;
					}
				} else if (code[i] == '"') {
					ast.push({
						type: 'literal',
						data: 'string',
						value: symbol
					});
					symbol = '';
					exit = true;
					break;
				} else {
					symbol += code[i];
				}
			}
			if (!exit) {
				throwParseError(code, lineCount, i, "Expected `\"' but got `EOF'");
			}
		} else if (code[i] == '{' && wsRegex.test(symbol)) {
			let funcName = '';
			while(code[++i] != '}') {
				if (!funcCallRegex.test(code[i])) {
					throwParseError(code, lineCount, i, "Expected `}' but got `" + code[i] + "'");
				}
				funcName += code[i];
			}
			if (programAst.functions.filter(x => x.name == funcName).length == 0) {
				throwParseError(code, lineCount, i, "Unknown function " + funcName);
			}
			ast.push({
				type: 'function',
				data: funcName
			});
			symbol = '';
		} else if (/[0-9]/.test(code[i]) && wsRegex.test(symbol)) {
			let num = code[i];
			let dotFound = false;
			while(/[0-9.]/.test(code[++i])) {
				if (code[i] == '.' && dotFound) {
					throwParseError(code, lineCount, i, "Expected number but got `" + code[i] + "'");
				} else if (code[i] == '.') {
					dotFound = true;
				}
				num += code[i];
			}
			ast.push({
				type: 'literal',
				data: 'number',
				value: parseFloat(num)
			});
			symbol = '';
			i--;
		} else if (code[i] == '<') {
			let varName = '';
			while (code[++i] != '>') {
				if (!funcCallRegex.test(code[i])) {
					throwParseError(code, lineCount, i, "Expected `>' but got `" + code[i] + "'");
				}
				varName += code[i];
			}
			let obj = {
				type: 'variable',
				data: varName
			};
			Object.defineProperty(obj, "value", {
				get: function () {
					return getVariableValue(this.data);
				}
			});
			ast.push(obj);
			symbol = '';
		} else if (/[+\-*/%^=!]/.test(code[i])) {
			symbol = code[i];
			if (/[+\-*/%^=!|&]/.test(code[i + 1])) symbol += code[++i];
			let obj = {
				type: 'operator'
			};
			switch (symbol) {
				case '+':
					obj.data = 'addition';
					break;
				case '-':
					obj.data = 'subtraction';
					break;
				case '*':
					obj.data = 'multiplication';
					break;
				case '/':
					obj.data = 'division';
					break;
				case '^':
					obj.data = 'bitwise-xor';
					break;
				case '%':
					obj.data = 'modulus';
					break;
				case '!':
					obj.data = 'negation';
					break;
				case '|':
					obj.data = 'bitwise-or';
					break;
				case '&':
					obj.data = 'bitwise-and';
					break;
				case '=':
					obj.data = 'assignment';
					break;
				case '++':
					obj.data = 'increment';
					break;
				case '--':
					obj.data = 'decrement';
					break;
				case '==':
					obj.data = 'compare';
					break;
				case '&&':
					obj.data = 'and';
					break;
				case '||':
					obj.data = 'or';
					break;
				case '**':
					obj.data = 'power';
					break;
				case '+=':
					obj.data = 'add-assign';
					break;
				case '-=':
					obj.data = 'sub-assign';
					break;
				case '*=':
					obj.data = 'mul-assign';
					break;
				case '/=':
					obj.data = 'div-assign';
					break;
				case '!=':
					obj.data = 'notcompare';
					break;
				default:
					throwParseError(code, lineCount, i, "Expected operator but got `" + symbol + "'");
			}
			ast.push(obj);
			symbol = '';
		} else if (code[i] == ';') {
			ast.push({ type: 'terminator' });
		} else {
			symbol += code[i];
		}
	}

	return ast;
}

function getVariableValue(varName) {
	console.log("STUB CALLED");
}

function runCode(ast) {
	if (ast.functions.filter(x => x.name == 'f').length == 0) {
		console.log("Error: No entry point f() found!");
		process.exit();
	}

	runFunction(ast.functions.filter(x => x.name == 'f')[0], [], ast);
}

function runFunction(func, argArr, ast) {
	if (options.verbose) console.log("Running", func.name);
	for(let i = 0; i < func.program.length; i++) {
		let token = func.program[i];
		evalExpr(token, i, func, argArr, ast);
	}
}

function evalExpr(expr, exprIndex, func, argArr, ast) {
	if (options.verbose) console.log("Evaluating", expr);
	if (options.verbose) console.log("Which is", exprIndex, "in", func.name);
	let argCount = 0;
	let args = [];
	let ret = undefined;

	switch(expr.type) {
		case 'function':
			let newFunc = ast.functions.filter(x => x.name == expr.data)[0];
			argCount = newFunc.args.length;
			for(let i = 1; i <= argCount; i++) {
				if (func.program[exprIndex + i].type == 'terminator') {
					console.log("Error: Insufficient arguments!");
					process.exit();
				}
				args.push(evalExpr(func.program[exprIndex + i], exprIndex + i, func, argArr, ast));
			}
			ret = runFunction(newFunc, args, ast);
			if (options.verbose) console.log("Returning", ret);
			return ret;
		case 'builtin':
			argCount = ast.builtins[expr.data].length;
			for(let i = 1; i <= argCount; i++) {
				if (func.program[exprIndex + i].type == 'terminator') {
					console.log("Error: Insufficient arguments!");
					process.exit();
				}
				args.push(evalExpr(func.program[exprIndex + i], exprIndex + i, func, argArr, ast));
			}
			ret = ast.builtins[expr.data].apply(this, args);
			if (options.verbose) console.log("Returning", ret);
			return ret;
		case 'arg':
			ret = argArr[func.args.indexOf(expr.data)];
			if (options.verbose) console.log("Returning", ret);
			return ret;
		case 'literal':
			ret = expr.value;
			if (options.verbose) console.log("Returning", ret);
			return ret;
	}
}