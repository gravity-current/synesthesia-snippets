# Synesthesia Snippets
This extension provides GLSL snippets to help write SSF scenes for Synesthesia.
See https://synesthesia.live/docs/index.html for more info.

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

To test on another computer, package the extension into a .vsix file and install it in VS Code to test it. To do this, run the following command:
```bash
vsce package
```
This will create a .vsix file in the root of the project. You can then install it in VS Code by running the following command:
```bash
code --install-extension synesthesia-snippets-{version}.vsix
```

## Publishing
To publish a new version of the extension, run the following commands:
```bash
vsce package
vsce publish {major|minor|patch|version}
```

[Semver](https://semver.org/) version number is incremented based on the command.


<!-- ## License
[MIT](LICENSE) -->