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
	print: function(args) {
		console.log(args[0].value);
	}
}
var funcNames = [];
var functions = {
	print: {
		name: 'print',
		argCount: 1,
		program: [{ type: 'builtin', data: 'print' }, { type: 'arg', data: 0 }]
	}
};

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
	if (options.verbose) console.log(code);
	let funcs = getFuncs(code);
	if (options.verbose) console.log(funcs);
	for(let i = 0; i < funcs.length; i++) {
		funcNames.push(funcs[i].substring(0, funcs[i].indexOf('(')));
	}
	for(let i = 0; i < funcs.length; i++) {
		functions[funcNames[i]] = parseFunc(funcs[i]);
	}
	if (options.verbose) console.log(JSON.stringify(functions, null, 4));

	runCode();
}

function runCode() {
	if (!functions.f) {
		console.log("Could not find entry point f!");
		return false;
	}

	return runFunction(functions.f, []);
}

function runFunction(func, argArr) {
	let program = func.program;
	if (options.verbose) console.log("Running", func.name);
	for(let i = 0; i < program.length; i++) {
		switch(program[i].type) {
			case 'literal':
			case 'variable':
				break;
			case 'operator':
				switch(program[i].data) {
					
				}
				break;
			case 'function':
				let otherFunc = functions[program[i].data];
				let argCount = otherFunc.argCount;
				let args = [];
				for(let j = 1; j <= argCount; j++) args.push(program[i += j]);
				runFunction(otherFunc, args);
				break;
			case 'builtin':
				let builtin = builtins[program[i].data];
				builtin(argArr);
				break;
		}
	}
}

function getFuncs(code) {
	let regex = /[a-zA-Z-_]+\((.|[\r\n])*?\)/gm;
	let funcs = [];
	
	while(m = regex.exec(code)) {
		funcs.push(m[0]);
		if (options.verbose) console.log("Found function", m[0]);
	}

	if (funcs.length == 0) {
		funcs.push('f(' + code + ')');
	}

	return funcs;
}

function parseFunc(func) {
	let ast = {};
	let symbol = '';
	ast.name = func.substring(0, func.indexOf('('));
	ast.argCount = 0;
	ast.program = [];
	for(let i = func.indexOf('(') + 1; i < func.length - 1; i++) {
		symbol += func[i];
		let symAst = parseSymbol(symbol.trim());
		if (symAst) {
			ast.program.push(symAst);
			symbol = '';
		}
	}

	if (symbol.trim() != '') {
		console.log("Unexpected end of function!");
		process.exit();
	}

	return ast;
}

function parseSymbol(symbol) {
	if (symbol.startsWith('"')) {
		if (symbol.length > 1 && symbol.endsWith('"') && !symbol.endsWith('\\"')) {
			return {
				type: 'literal',
				data: 'string',
				value: symbol.substring(1, symbol.length - 1)
			};
		} else return false;
	} else if (symbol.startsWith('[')) {
		if (symbol.endsWith(']')) {
			return {
				type: 'literal',
				data: 'number',
				value: parseInt(symbol.substring(1, symbol.length - 1))
			};
		} else return false;
	} else if (symbol.startsWith('<')) {
		if (symbol.endsWith('>')) {
			return {
				type: 'variable',
				data: symbol.substring(1, symbol.length - 1)
			};
		} else return false;
	} else if (symbol.startsWith('{')) {
		if (symbol.endsWith('}')) {
			let funcName = symbol.substring(1, symbol.length - 1);
			if (!funcNames.includes(funcName) && !functions[funcName]) 
				console.log('Unknown function', funcName);
			return {
				type: 'function',
				data: funcName
			};
		} else return false;
	} else if (symbol == ';') {
		return {
			type: 'operator',
			data: 'terminator'
		}
	} else if (symbol == '+') {
		return {
			type: 'operator',
			data: 'addition'
		}
	} else if (symbol == '-') {
		return {
			type: 'operator',
			data: 'subtraction'
		}
	} else if (symbol == '*') {
		return {
			type: 'operator',
			data: 'multiplicaction'
		}
	} else if (symbol == '/') {
		return {
			type: 'operator',
			data: 'division'
		}
	} else if (symbol == '=') {
		return {
			type: 'operator',
			data: 'assignment'
		}
	}
}
