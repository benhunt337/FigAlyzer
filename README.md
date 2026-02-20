Below are the steps to get your plugin running. You can also find instructions at:

  https://www.figma.com/plugin-docs/plugin-quickstart-guide/

This plugin template uses Typescript and NPM, two standard tools in creating JavaScript applications.

First, download Node.js which comes with NPM. This will allow you to install TypeScript and other
libraries. You can find the download link here:

  https://nodejs.org/en/download/

Next, install TypeScript using the command:

  npm install -g typescript

Finally, in the directory of your plugin, get the latest type definitions for the plugin API by running:

  npm install --save-dev @figma/plugin-typings

If you are familiar with JavaScript, TypeScript will look very familiar. In fact, valid JavaScript code
is already valid Typescript code.

TypeScript adds type annotations to variables. This allows code editors such as Visual Studio Code
to provide information about the Figma API while you are writing code, as well as help catch bugs
you previously didn't notice.

For more information, visit https://www.typescriptlang.org/

Using TypeScript requires a compiler to convert TypeScript (code.ts) into JavaScript (code.js)
for the browser to run.

We recommend writing TypeScript code using Visual Studio code:

1. Download Visual Studio Code if you haven't already: https://code.visualstudio.com/.
2. Open this directory in Visual Studio Code.
3. Compile TypeScript to JavaScript: Run the "Terminal > Run Build Task..." menu item,
    then select "npm: watch". You will have to do this again every time
    you reopen Visual Studio Code.

That's it! Visual Studio Code will regenerate the JavaScript file every time you save.

## Claude API proxy (Vercel Edge)

The `api/claude-proxy` Edge Function forwards requests to Claude's Messages API so the Figma plugin can call Claude without exposing your API key.

### Deploy

1. Install the Vercel CLI: `npm i -g vercel`
2. From this directory run: `vercel`
3. In the [Vercel Dashboard](https://vercel.com/dashboard), open your project → **Settings** → **Environment Variables**. Add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your Anthropic API key

### Usage

Send a **POST** request to your deployed URL, e.g. `https://your-project.vercel.app/api/claude-proxy`, with a JSON body in [Anthropic Messages API format](https://docs.anthropic.com/en/api/messages) (e.g. `model`, `max_tokens`, `messages`). The proxy adds your API key and returns the API response with `Access-Control-Allow-Origin: *`.
