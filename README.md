# Synesthesia Snippets
This extension provides first-class support for Synesthesia scene folders (`.synScene`) in VS Code.

- **JSON Schema**: `scene.json` files inside `.synScene` folders are automatically validated and get schema-based IntelliSense.
- **Rich GLSL IntelliSense**: Synesthesia uniforms, constants, and helper functions show proper completion details, hover docs, and signature help in `main.glsl`.
- **Rich JavaScript IntelliSense**: Scene lifecycle functions and Synesthesia scripting APIs show proper completion details, hover docs, and signature help in `script.js`.
- **Snippets Still Work**: Existing snippet bodies remain the source of truth for insert text, so snippet updates automatically feed the runtime providers.

## Contributing

### Adding a new snippet
Snippets are defined in the three JSON files in the `snippets` folder. 
- `uniforms.json` contains snippets for uniforms that are available in GLSL and JavaScript
- `glsl.json` contains snippets for GLSL functions and variables
- `js.json` contains snippets for JavaScript functions and variables

To add a new snippet, add a new entry to the appropriate JSON file. The entry should have the following format:
```json
"snippetType: snippetName": {
    "prefix": ["snippetName", "alias1", "alias2"],
    "body": "snippetName(${1:arg1:type}, ${2:arg2:type}, ...)",
    "description": "Snippet description."
},
```
- `snippetType`: `uniform` or `function`
- `snippetName`: The name of the uniform or function
- `prefix`: An array of strings that will trigger the snippet. Include the `snippetName` as the first element.
- `body`: The snippet body. For uniforms this is `snippetName`. For functions use `${n:argName:type}` to define arguments. The `type` is optional and will be used to provide type information in the editor.
- `description`: A description of the snippet, shown in the editor to provide more information.


Learn more about VS Code snippets:
[Creating snippets](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_builtin-snippets)

## Testing
You can quickly test your changes by pressing `F5` to launch a new VS Code window with your extension loaded.

In the Extension Development Host, open a `.synScene` folder and verify the following:

- `scene.json` shows schema validation and property completion.
- `main.glsl` keeps normal GLSL coloring from your existing GLSL support and adds Synesthesia completions, hovers, and parameter hints.
- `script.js` keeps normal JavaScript IntelliSense and adds Synesthesia completions, hovers, and parameter hints.

To test on another computer, package the extension into a .vsix file and install it in VS Code to test it. To do this, run the following command:
```bash
vsce package
```
This will create a .vsix file in the root of the project. You can then install it in VS Code by running the following command:
```bash
code --install-extension synesthesia-snippets-{version}.vsix
```

## Publishing

### Setup
VS Code extensions are published with the vsce cli tool. To install it, run the following command:
```bash
npm install -g @vscode/vsce
```
To publish the extension, you need to create a [personal access token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publishing-extensions). You can then run the following command to login to the VS Code Marketplace:
```bash
vsce login synesthesia
```

### Publish
To publish a new version of the extension (id: synesthesia.synesthesia-snippets), run the following commands:
```bash
vsce package
vsce publish {major|minor|patch|version}
```

[Semver](https://semver.org/) version number is incremented based on the command.


<!-- ## License
[MIT](LICENSE) -->