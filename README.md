# zli

**zli** is a lightweight command-line interface (CLI) framework built on top of [Zod](https://github.com/colinhacks/zod), a TypeScript-first schema validation library. It allows you to create robust, type-safe CLI applications with ease.

## Features

- **Type-safe Argument Parsing**: Leverages Zod schemas for argument validation and parsing.
- **Automatic Help Generation**: Generates help messages based on command and option descriptions.
- **Command Aliases**: Supports multiple aliases for commands and options.
- **Option Aliases**: Define short and long aliases for options.
- **Custom Validation**: Utilize Zod's powerful validation capabilities, including custom refinements.
- **Error Handling**: Provides informative error messages for invalid input.
- **Built with AI Assistance**: Developed with the help of AI to enhance code quality and efficiency.

## Installation

```bash
# Using npm
npm install zli

# Using yarn
yarn add zli

# Using bun
bun add zli
```

## Usage

Here's an example of how to use zli in your project:
``` typescript
#!/usr/bin/env bun

import './zod-extensions.ts';
import { z } from 'zod';
import { Zli } from './zli';

// Define your command schemas
const AddSchema = z.object({
  name: z.string().describe('The name of the user').aliases('n'),
  age: z.number().min(0).describe('The age of the user').aliases('a'),
  verbose: z.boolean().optional().describe('Enable verbose logging').aliases('v'),
}).describe('Adds a new user to the database');

// Initialize the CLI
const zli = new Zli()
  .addCommand('add', AddSchema, (args) => {
    console.log('Executing add command with args:', args);
    // Your command logic here
  }, 'a', 'addition', 'new');

// Parse the command-line arguments
zli.parse(process.argv.slice(2));
```

## Running the CLI
```bash
# Basic usage
bun index.ts add --name "Alice" --age 30

# Using command aliases
bun index.ts a --name "Bob" --age 25

# Displaying help
bun index.ts --help
bun index.ts add --help
```

## Testing

To run the unit tests using Bun and Sinon:
```bash
bun test
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

This project is licensed under the MIT License.

## Acknowledgements

This project was developed with the assistance of AI tools to enhance productivity and code quality.