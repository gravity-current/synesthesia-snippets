const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { getLanguageService } = require('vscode-json-languageservice');
const { TextDocument } = require('vscode-languageserver-textdocument');

const SCENE_GLSL_SELECTOR = { language: 'glsl', pattern: '**/*.synScene/main.glsl' };
const SCENE_JS_SELECTOR = { language: 'javascript', pattern: '**/*.synScene/script.js' };
const SCENE_JSON_PATTERN = '**/*.synScene/scene.json';
const SCENE_JSON_SELECTORS = [
	{ language: 'json', pattern: SCENE_JSON_PATTERN },
	{ language: 'jsonc', pattern: SCENE_JSON_PATTERN }
];

function activate(context) {
	const api = loadApi(context.extensionPath);
	const sceneJson = createSceneJsonSupport(context.extensionPath);

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			SCENE_GLSL_SELECTOR,
			createCompletionProvider(api.glsl),
			'.',
			'('
		),
		vscode.languages.registerCompletionItemProvider(
			SCENE_JS_SELECTOR,
			createCompletionProvider(api.javascript),
			'.',
			'('
		),
		vscode.languages.registerHoverProvider(
			SCENE_GLSL_SELECTOR,
			createHoverProvider(api.glslBySymbol)
		),
		vscode.languages.registerHoverProvider(
			SCENE_JS_SELECTOR,
			createHoverProvider(api.javascriptBySymbol)
		),
		vscode.languages.registerSignatureHelpProvider(
			SCENE_GLSL_SELECTOR,
			createSignatureHelpProvider(api.glslFunctions),
			'(',
			','
		),
		vscode.languages.registerSignatureHelpProvider(
			SCENE_JS_SELECTOR,
			createSignatureHelpProvider(api.javascriptFunctions),
			'(',
			','
		),
		...registerSceneJsonProviders(sceneJson)
	);

	registerSceneJsonDiagnostics(context, sceneJson);
}

function deactivate() {}

function loadApi(extensionPath) {
	const glslEntries = [
		...loadSnippetFile(extensionPath, 'snippets/glsl.json', 'glsl'),
		...loadSnippetFile(extensionPath, 'snippets/uniforms.json', 'glsl')
	];
	const javascriptEntries = [
		...loadSnippetFile(extensionPath, 'snippets/js.json', 'javascript'),
		...loadSnippetFile(extensionPath, 'snippets/uniforms.json', 'javascript')
	];

	return {
		glsl: glslEntries,
		javascript: javascriptEntries,
		glslBySymbol: indexBySymbol(glslEntries),
		javascriptBySymbol: indexBySymbol(javascriptEntries),
		glslFunctions: indexFunctions(glslEntries),
		javascriptFunctions: indexFunctions(javascriptEntries)
	};
}

function createSceneJsonSupport(extensionPath) {
	const schemaPath = path.join(extensionPath, 'schemas/scene.schema.json');
	const schemaUri = vscode.Uri.file(schemaPath).toString();
	const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
	const service = getLanguageService({});

	service.configure({
		validate: true,
		allowComments: true,
		schemas: [{
			uri: schemaUri,
			fileMatch: [
				SCENE_JSON_PATTERN,
				'*.synScene/scene.json',
				'**/*.synScene/scene.json'
			],
			schema
		}]
	});

	return {
		service,
		schema
	};
}

function registerSceneJsonProviders(sceneJson) {
	const completions = vscode.languages.registerCompletionItemProvider(
		SCENE_JSON_SELECTORS,
		{
			async provideCompletionItems(document, position) {
				if (!isSceneJsonDocument(document)) {
					return null;
				}

				const textDocument = toJsonTextDocument(document);
				const jsonDocument = sceneJson.service.parseJSONDocument(textDocument);
				const completionsResult = await sceneJson.service.doComplete(textDocument, toJsonPosition(position), jsonDocument);
				if (!completionsResult) {
					return null;
				}

				return new vscode.CompletionList(
					completionsResult.items.map(toVsCodeCompletionItem),
					completionsResult.isIncomplete
				);
			}
		},
		'"',
		':',
		','
	);

	const hovers = vscode.languages.registerHoverProvider(
		SCENE_JSON_SELECTORS,
		{
			async provideHover(document, position) {
				if (!isSceneJsonDocument(document)) {
					return null;
				}

				const textDocument = toJsonTextDocument(document);
				const jsonDocument = sceneJson.service.parseJSONDocument(textDocument);
				const hover = await sceneJson.service.doHover(textDocument, toJsonPosition(position), jsonDocument);
				if (!hover) {
					return null;
				}

				return new vscode.Hover(
					toVsCodeMarkdown(hover.contents),
					hover.range ? toVsCodeRange(hover.range) : undefined
				);
			}
		}
	);

	return [completions, hovers];
}

function registerSceneJsonDiagnostics(context, sceneJson) {
	const diagnostics = vscode.languages.createDiagnosticCollection('synesthesia-scene-json');
	context.subscriptions.push(diagnostics);

	const refresh = (document) => {
		void validateSceneJsonDocument(sceneJson, diagnostics, document);
	};

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(refresh),
		vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
		vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri))
	);

	for (const document of vscode.workspace.textDocuments) {
		refresh(document);
	}
}

async function validateSceneJsonDocument(sceneJson, diagnostics, document) {
	if (!isSceneJsonDocument(document)) {
		diagnostics.delete(document.uri);
		return;
	}

	const textDocument = toJsonTextDocument(document);
	const jsonDocument = sceneJson.service.parseJSONDocument(textDocument);
	const validation = await sceneJson.service.doValidation(
		textDocument,
		jsonDocument,
		{
			comments: 'ignore',
			trailingCommas: 'warning',
			schemaValidation: 'warning',
			schemaRequest: 'ignore'
		},
		sceneJson.schema
	);

	diagnostics.set(document.uri, validation.map(toVsCodeDiagnostic));
}

function isSceneJsonDocument(document) {
	return ['json', 'jsonc'].includes(document.languageId)
		&& /(?:^|[\\/])[^\\/]+\.synScene[\\/]scene\.json$/iu.test(document.uri.fsPath);
}

function toJsonTextDocument(document) {
	return TextDocument.create(document.uri.toString(), document.languageId, document.version, document.getText());
}

function toJsonPosition(position) {
	return { line: position.line, character: position.character };
}

function toVsCodeRange(range) {
	return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character);
}

function toVsCodeDiagnostic(diagnostic) {
	const result = new vscode.Diagnostic(
		toVsCodeRange(diagnostic.range),
		diagnostic.message,
		toVsCodeDiagnosticSeverity(diagnostic.severity)
	);
	result.code = diagnostic.code;
	result.source = diagnostic.source || 'synesthesia-scene-json';
	return result;
}

function toVsCodeDiagnosticSeverity(severity) {
	switch (severity) {
		case 1:
			return vscode.DiagnosticSeverity.Error;
		case 2:
			return vscode.DiagnosticSeverity.Warning;
		case 3:
			return vscode.DiagnosticSeverity.Information;
		case 4:
			return vscode.DiagnosticSeverity.Hint;
		default:
			return vscode.DiagnosticSeverity.Warning;
	}
}

function toVsCodeCompletionItem(item) {
	const completion = new vscode.CompletionItem(item.label, item.kind);
	completion.detail = item.detail;
	completion.sortText = item.sortText;
	completion.filterText = item.filterText;
	completion.preselect = item.preselect;
	completion.documentation = toVsCodeMarkdown(item.documentation);
	completion.commitCharacters = item.commitCharacters;

	if (item.textEdit && 'range' in item.textEdit) {
		completion.range = toVsCodeRange(item.textEdit.range);
		completion.insertText = item.insertTextFormat === 2
			? new vscode.SnippetString(item.textEdit.newText)
			: item.textEdit.newText;
	} else if (item.insertText) {
		completion.insertText = item.insertTextFormat === 2
			? new vscode.SnippetString(item.insertText)
			: item.insertText;
	}

	if (Array.isArray(item.additionalTextEdits)) {
		completion.additionalTextEdits = item.additionalTextEdits.map((edit) => new vscode.TextEdit(
			toVsCodeRange(edit.range),
			edit.newText
		));
	}

	return completion;
}

function toVsCodeMarkdown(content) {
	if (!content) {
		return undefined;
	}

	if (typeof content === 'string') {
		return new vscode.MarkdownString(content);
	}

	if (Array.isArray(content)) {
		return content.map(toMarkedStringText).join('\n\n');
	}

	if (typeof content === 'object' && typeof content.value === 'string') {
		const markdown = new vscode.MarkdownString();
		markdown.appendMarkdown(content.value);
		return markdown;
	}

	return undefined;
}

function toMarkedStringText(content) {
	if (typeof content === 'string') {
		return content;
	}

	if (content && typeof content.value === 'string') {
		return content.language
			? `\`\`\`${content.language}\n${content.value}\n\`\`\``
			: content.value;
	}

	return '';
}

function loadSnippetFile(extensionPath, relativePath, language) {
	const filePath = path.join(extensionPath, relativePath);
	const snippetJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
	return Object.entries(snippetJson)
		.map(([key, snippet]) => parseSnippetEntry(key, snippet, language))
		.filter(Boolean);
}

function parseSnippetEntry(key, snippet, language) {
	const category = String(key).split(':', 1)[0].trim();
	const body = Array.isArray(snippet.body) ? snippet.body.join('\n') : String(snippet.body ?? '');
	const symbol = extractSymbolName(key, body, category);
	if (!symbol) {
		return null;
	}

	const description = String(snippet.description ?? '').trim();
	const parsedDescription = parseDescription(description);
	const parameters = extractParameters(body);
	const signature = category === 'function'
		? `${symbol}(${parameters.map(formatParameterSignature).join(', ')})`
		: symbol;

	return {
		key,
		language,
		category,
		symbol,
		body,
		prefixes: Array.isArray(snippet.prefix) ? snippet.prefix.map(String) : [],
		description,
		summary: parsedDescription.summary,
		resultType: parsedDescription.resultType,
		parameters,
		signature
	};
}

function extractSymbolName(key, body, category) {
	const fallback = String(key)
		.replace(/^(function|uniform):\s*/u, '')
		.replace(/\(\)$/u, '')
		.trim();

	if (category === 'function') {
		const functionDeclaration = body.match(/^(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/u);
		if (functionDeclaration) {
			return functionDeclaration[1];
		}
	}

	const identifier = body.match(/[A-Za-z_][A-Za-z0-9_]*/u);
	return identifier ? identifier[0] : fallback;
}

function parseDescription(description) {
	const match = description.match(/^([^:]+):\s*(.*)$/su);
	if (!match) {
		return {
			resultType: '',
			summary: description
		};
	}

	return {
		resultType: match[1].trim(),
		summary: match[2].trim()
	};
}

function extractParameters(body) {
	const openParen = body.indexOf('(');
	const closeParen = body.indexOf(')', openParen + 1);
	if (openParen === -1) {
		return [];
	}

	const parameterSource = closeParen === -1
		? body.slice(openParen + 1)
		: body.slice(openParen + 1, closeParen);

	const snippetParameters = [...parameterSource.matchAll(/\$\{\d+:([^}:]+)(?::([^}]+))?\}/gu)].map((match) => ({
		name: match[1].trim(),
		type: (match[2] ?? '').trim(),
		documentation: ''
	}));

	if (snippetParameters.length > 0) {
		return snippetParameters;
	}

	return parameterSource
		.split(',')
		.map((segment) => segment.trim())
		.filter(Boolean)
		.map((segment) => ({
			name: segment,
			type: '',
			documentation: ''
		}));
}

function formatParameterSignature(parameter) {
	return parameter.type ? `${parameter.name}: ${parameter.type}` : parameter.name;
}

function indexBySymbol(entries) {
	return new Map(entries.map((entry) => [entry.symbol, entry]));
}

function indexFunctions(entries) {
	return new Map(
		entries
			.filter((entry) => entry.category === 'function')
			.map((entry) => [entry.symbol, entry])
	);
}

function createCompletionProvider(entries) {
	return {
		provideCompletionItems(document, position) {
			const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/u);
			return entries.map((entry) => createCompletionItem(entry, range));
		}
	};
}

function createCompletionItem(entry, range) {
	const item = new vscode.CompletionItem(entry.symbol, completionKindFor(entry));
	item.range = range;
	item.insertText = new vscode.SnippetString(entry.body);
	item.filterText = [entry.symbol, ...entry.prefixes].join(' ');
	item.sortText = `${entry.category === 'function' ? '0' : '1'}_${entry.symbol}`;
	item.detail = buildCompletionDetail(entry);
	item.documentation = buildDocumentation(entry);
	if (entry.category === 'function') {
		item.command = {
			command: 'editor.action.triggerParameterHints',
			title: 'Trigger parameter hints'
		};
		item.insertTextRules = vscode.CompletionItemInsertTextRule.InsertAsSnippet;
	}
	return item;
}

function completionKindFor(entry) {
	if (entry.category === 'function') {
		return vscode.CompletionItemKind.Function;
	}

	if (/^const\b/iu.test(entry.resultType) || /^[A-Z0-9_]+$/u.test(entry.symbol)) {
		return vscode.CompletionItemKind.Constant;
	}

	return vscode.CompletionItemKind.Variable;
}

function buildCompletionDetail(entry) {
	if (entry.category === 'function') {
		return entry.resultType
			? `${entry.signature} -> ${entry.resultType}`
			: entry.signature;
	}

	return entry.resultType
		? `${entry.category}: ${entry.resultType}`
		: entry.category;
}

function buildDocumentation(entry) {
	const markdown = new vscode.MarkdownString(undefined, true);
	markdown.isTrusted = false;
	markdown.appendCodeblock(entry.signature, entry.language === 'javascript' ? 'javascript' : 'glsl');
	if (entry.summary) {
		markdown.appendMarkdown(`${entry.summary}\n\n`);
	}
	if (entry.prefixes.length > 1) {
		markdown.appendMarkdown(`Aliases: ${entry.prefixes.slice(1).map((prefix) => `\`${prefix}\``).join(', ')}\n\n`);
	}
	if (entry.resultType && entry.category === 'function') {
		markdown.appendMarkdown(`Returns: \`${entry.resultType}\``);
	}
	return markdown;
}

function createHoverProvider(entriesBySymbol) {
	return {
		provideHover(document, position) {
			const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/u);
			if (!range) {
				return null;
			}

			const symbol = document.getText(range);
			const entry = entriesBySymbol.get(symbol);
			if (!entry) {
				return null;
			}

			return new vscode.Hover(buildDocumentation(entry), range);
		}
	};
}

function createSignatureHelpProvider(functionsBySymbol) {
	return {
		provideSignatureHelp(document, position) {
			const callContext = getCallContext(document, position);
			if (!callContext) {
				return null;
			}

			const entry = functionsBySymbol.get(callContext.name);
			if (!entry) {
				return null;
			}

			const signature = new vscode.SignatureInformation(
				buildCompletionDetail(entry),
				entry.summary || entry.description
			);
			signature.parameters = entry.parameters.map((parameter) => new vscode.ParameterInformation(
				formatParameterSignature(parameter),
				parameter.documentation || parameter.type || parameter.name
			));

			const help = new vscode.SignatureHelp();
			help.signatures = [signature];
			help.activeSignature = 0;
			help.activeParameter = Math.min(callContext.argumentIndex, Math.max(signature.parameters.length - 1, 0));
			return help;
		}
	};
}

function getCallContext(document, position) {
	const startLine = Math.max(0, position.line - 20);
	const text = document.getText(new vscode.Range(new vscode.Position(startLine, 0), position));
	let depth = 0;
	let argumentIndex = 0;

	for (let index = text.length - 1; index >= 0; index -= 1) {
		const character = text[index];
		if (character === ')') {
			depth += 1;
			continue;
		}

		if (character === '(') {
			if (depth === 0) {
				let end = index;
				while (end > 0 && /\s/u.test(text[end - 1])) {
					end -= 1;
				}

				let start = end;
				while (start > 0 && /[A-Za-z0-9_]/u.test(text[start - 1])) {
					start -= 1;
				}

				const name = text.slice(start, end);
				return name ? { name, argumentIndex } : null;
			}

			depth -= 1;
			continue;
		}

		if (character === ',' && depth === 0) {
			argumentIndex += 1;
		}
	}

	return null;
}

module.exports = {
	activate,
	deactivate
};