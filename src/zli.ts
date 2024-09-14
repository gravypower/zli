// src/zli.ts

import { z, type ZodTypeAny, ZodBoolean, ZodNumber } from 'zod';
import './zod-extensions'; // Ensure extensions are loaded

// CommandDefinition now uses generics for type safety
export interface CommandDefinition<T extends z.ZodTypeAny> {
    schema: T;
    handler: (args: z.infer<T>) => void;
    aliases: string[];
}

type ParseOptionResult =
    | {
    optionKey: string;
    fieldType: ZodTypeAny;
    value?: string;
    newIndex: number;
    success: true;
}
    | {
    newIndex: number;
    success: false;
};

// The Zli class implements a fluent API to add commands and parse the CLI
export class Zli {
    private commands: Record<string, CommandDefinition<z.ZodTypeAny>> = {};

    /**
     * Add a new command to the CLI with variable aliases.
     * @param commandName - The primary name of the command.
     * @param schema - The Zod schema defining expected options.
     * @param handler - The function to execute when the command is called.
     * @param aliases - Additional aliases for the command.
     * @returns The Zli instance for chaining.
     */
    addCommand<T extends z.ZodTypeAny>(
        commandName: string,
        schema: T,
        handler: (args: z.infer<T>) => void,
        ...aliases: string[]
    ): this {
        this.commands[commandName] = { schema, handler, aliases };
        return this;
    }

    /**
     * Parse CLI arguments and handle the appropriate command.
     * @param args - The array of arguments to parse.
     */
    parse(args: string[]): void {
        if (args.length === 0) {
            this.displayHelp();
            return;
        }

        const subcommand = args[0];
        const options = args.slice(1);

        // Find the command by name or alias
        const command = Object.entries(this.commands).find(([cmdName, cmd]) =>
            [cmdName, ...cmd.aliases].includes(subcommand)
        );

        if (!command) {
            if (subcommand === '--help') {
                this.displayHelp();
            } else {
                console.error(`Unknown command: ${subcommand}`);
                this.displayHelp();
            }
            return;
        }

        const [commandName, commandDefinition] = command;

        if (options.includes('--help')) {
            this.displayHelpForCommand(commandName, commandDefinition.schema);
            return;
        }

        const parsedArgs = this.parseArgs(options, commandDefinition.schema);
        if (!parsedArgs) {
            // Display help if validation fails or unknown argument is encountered
            if (this.shouldDisplayHelp) {
                this.displayHelpForCommand(commandName, commandDefinition.schema);
            }
            return;
        }

        try {
            commandDefinition.handler(parsedArgs);
        } catch (error: any) {
            console.error(`An error occurred while executing the command: ${error.message}`);
        }
    }

    private shouldDisplayHelp = false;

    /**
     * Parse options using the provided Zod schema.
     * @param args - The array of arguments to parse.
     * @param schema - The Zod schema defining expected options.
     * @returns The parsed and validated arguments, or null if validation fails.
     */
    private parseArgs<T extends z.ZodTypeAny>(args: string[], schema: T): z.infer<T> | null {
        const unwrappedSchema = this.unwrapSchema(schema);
        const schemaShape = unwrappedSchema.shape;
        const schemaKeys = Object.keys(schemaShape);

        const parsedArgs: Record<string, any> = {};
        const processedIndices = new Set<number>();

        // Map option names and aliases to schema keys
        const recognizedOptions = new Map<string, string>();
        for (const key of schemaKeys) {
            const field = schemaShape[key];
            const aliases = field.getAliases();
            recognizedOptions.set(`--${key}`, key);
            recognizedOptions.set(`-${key}`, key); // Add short option with single dash
            for (const alias of aliases) {
                recognizedOptions.set(alias, key);
            }
        }

        let i = 0;
        while (i < args.length) {
            let arg = args[i];
            if (arg.startsWith('--')) {
                // Handle long options
                const result = this.parseOption(
                    arg,
                    args,
                    i,
                    recognizedOptions,
                    schemaShape,
                    processedIndices
                );

                if (!result.success) {
                    return null;
                }

                i = result.newIndex;
                const { optionKey, fieldType, value } = result;

                if (
                    fieldType instanceof ZodBoolean ||
                    (fieldType instanceof z.ZodOptional && fieldType._def.innerType instanceof ZodBoolean)
                ) {
                    parsedArgs[optionKey] = value === 'true';
                    i++; // Move to the next argument
                } else if (fieldType instanceof z.ZodArray) {
                    if (value) {
                        // Handle comma-separated values
                        parsedArgs[optionKey] = value.split(',');
                    } else {
                        const values = [];
                        i++;
                        while (i < args.length && !args[i].startsWith('-')) {
                            values.push(args[i]);
                            processedIndices.add(i);
                            i++;
                        }
                        parsedArgs[optionKey] = values;
                    }
                } else {
                    parsedArgs[optionKey] = this.parseValue(value!, fieldType);
                    i = result.newIndex;
                }
            } else if (arg.startsWith('-') && arg.length > 2 && !arg.startsWith('--')) {
                // Handle combined short flags
                const flags = arg.slice(1).split('');
                processedIndices.add(i);
                i++; // Move to the next argument

                for (const flag of flags) {
                    const flagArg = `-${flag}`;
                    const result = this.parseOption(
                        flagArg,
                        args,
                        i - 1,
                        recognizedOptions,
                        schemaShape,
                        processedIndices
                    );

                    if (!result.success) {
                        return null;
                    }

                    const { optionKey, fieldType } = result;

                    if (
                        fieldType instanceof ZodBoolean ||
                        (fieldType instanceof z.ZodOptional && fieldType._def.innerType instanceof ZodBoolean)
                    ) {
                        parsedArgs[optionKey] = true;
                    } else {
                        if (i >= args.length || args[i].startsWith('-')) {
                            console.error(`Option ${flagArg} requires a value`);
                            this.shouldDisplayHelp = true;
                            return null;
                        }
                        const val = args[i];
                        processedIndices.add(i);
                        i++;
                        parsedArgs[optionKey] = this.parseValue(val, fieldType);
                    }
                }
            } else if (arg.startsWith('-')) {
                // Handle single-character short options
                const result = this.parseOption(
                    arg,
                    args,
                    i,
                    recognizedOptions,
                    schemaShape,
                    processedIndices
                );

                if (!result.success) {
                    return null;
                }

                i = result.newIndex;
                const { optionKey, fieldType, value } = result;

                if (
                    fieldType instanceof ZodBoolean ||
                    (fieldType instanceof z.ZodOptional && fieldType._def.innerType instanceof ZodBoolean)
                ) {
                    parsedArgs[optionKey] = value === 'true';
                    i++; // Move to the next argument
                } else {
                    parsedArgs[optionKey] = this.parseValue(value!, fieldType);
                    i = result.newIndex;
                }
            } else {
                // Unrecognized argument
                console.error(`Unknown argument: ${arg}`);
                this.shouldDisplayHelp = true;
                return null;
            }
        }

        const validationResult = schema.safeParse(parsedArgs);
        if (!validationResult.success) {
            this.displayValidationErrors(validationResult.error);
            this.shouldDisplayHelp = true;
            return null;
        }

        return validationResult.data;
    }

    /**
     * Helper method to parse individual options.
     */
    private parseOption(
        arg: string,
        args: string[],
        i: number,
        recognizedOptions: Map<string, string>,
        schemaShape: Record<string, ZodTypeAny>,
        processedIndices: Set<number>
    ): ParseOptionResult {
        let value: string | undefined;
        if (arg.includes('=')) {
            [arg, value] = arg.split('=');
        }
        const optionKey = recognizedOptions.get(arg);
        if (!optionKey) {
            console.error(`Unknown option: ${arg}`);
            this.shouldDisplayHelp = true;
            return { newIndex: i, success: false };
        }

        processedIndices.add(i);

        const fieldType = schemaShape[optionKey];
        if (!fieldType) {
            console.error(`Unknown option: ${arg}`);
            this.shouldDisplayHelp = true;
            return { newIndex: i, success: false };
        }

        if (
            fieldType instanceof ZodBoolean ||
            (fieldType instanceof z.ZodOptional && fieldType._def.innerType instanceof ZodBoolean)
        ) {
            value = value ? value : 'true';
            return { optionKey, fieldType, value, newIndex: i, success: true };
        } else if (fieldType instanceof z.ZodArray) {
            // For array options, we let parseArgs handle the values
            return { optionKey, fieldType, newIndex: i, success: true };
        } else if (!value) {
            if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
                console.error(`Option ${arg} requires a value`);
                this.shouldDisplayHelp = true;
                return { newIndex: i, success: false };
            }
            value = args[i + 1];
            processedIndices.add(i + 1);
            return { optionKey, fieldType, value, newIndex: i + 2, success: true };
        } else {
            return { optionKey, fieldType, value, newIndex: i + 1, success: true };
        }
    }

    /**
     * Helper method to unwrap Zod schemas that might be wrapped in effects (e.g., refine).
     * @param schema - The Zod schema to unwrap.
     * @returns The unwrapped ZodObject schema.
     */
    private unwrapSchema<T extends z.ZodTypeAny>(schema: T): z.ZodObject<any> {
        if (schema instanceof z.ZodEffects) {
            return this.unwrapSchema(schema._def.schema);
        } else if (schema instanceof z.ZodObject) {
            return schema;
        } else {
            throw new Error('Unsupported schema type');
        }
    }

    /**
     * Helper function to parse individual values based on their Zod type.
     * @param value - The string value to parse.
     * @param type - The Zod type to use for parsing.
     * @returns The parsed value.
     */
    private parseValue(value: string, type: ZodTypeAny): any {
        if (
            type instanceof ZodNumber ||
            (type instanceof z.ZodOptional && type._def.innerType instanceof ZodNumber)
        ) {
            const parsed = Number(value);
            return isNaN(parsed) ? value : parsed;
        } else if (
            type instanceof ZodBoolean ||
            (type instanceof z.ZodOptional && type._def.innerType instanceof ZodBoolean)
        ) {
            return value === 'true' || value === 'false' ? value === 'true' : value;
        }
        return value;
    }

    /**
     * Display validation errors in a user-friendly way.
     * @param error - The ZodError containing validation issues.
     */
    private displayValidationErrors(error: z.ZodError): void {
        let errorMessage = 'Argument validation failed:\n';
        error.issues.forEach(issue => {
            const path = issue.path.join(' -> ') || 'Input';
            errorMessage += `  - ${path}: ${issue.message}\n`;
        });
        console.error(errorMessage.trim());
    }

    /**
     * Display help for all available commands.
     */
    private displayHelp(): void {
        let helpMessage = 'Available commands:\n';
        for (const [commandName, { aliases, schema }] of Object.entries(this.commands)) {
            const description = schema.getDescription() || 'No description available';
            const aliasText = aliases.length > 0 ? ` (${aliases.join(', ')})` : '';
            helpMessage += `  ${commandName}${aliasText}: ${description}\n`;
        }
        helpMessage += '\nUse --help with a command for more details.';
        console.log(helpMessage);
    }

    /**
     * Display help for a specific command, including its options and descriptions.
     * @param commandName - The name of the command.
     * @param schema - The Zod schema defining the command's options.
     */
    private displayHelpForCommand(commandName: string, schema: z.ZodTypeAny): void {
        const unwrappedSchema = this.unwrapSchema(schema);
        const description = unwrappedSchema.getDescription() || 'No description available';
        let helpMessage = `\nUsage: ${commandName} [options]\n\n`;
        helpMessage += `${description}\n\nOptions:\n`;

        const schemaShape = unwrappedSchema.shape;

        for (const key in schemaShape) {
            const type = schemaShape[key];
            const optionDesc = type.getDescription() || 'No description available';
            const aliases = type.getAliases();
            const aliasText = aliases.length > 0 ? ` (${aliases.join(', ')})` : '';
            const isOptional = type.isOptional() ? '(optional)' : '(required)';
            helpMessage += `  --${key}${aliasText} ${isOptional}: ${optionDesc}\n`;
        }

        helpMessage += '\nExamples:';
        console.log(helpMessage);
    }
}
