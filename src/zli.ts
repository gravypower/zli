// zli.ts
import { z, type ZodTypeAny, ZodBoolean, ZodNumber } from "zod";
import './zod-extensions'; // Ensure extensions are loaded

// CommandDefinition now uses generics for type safety
interface CommandDefinition<T extends z.ZodTypeAny> {
    schema: T;
    handler: (args: z.infer<T>) => void;
    aliases: string[];
}

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
            this.displayHelpForCommand(commandName, commandDefinition.schema);
            return;
        }

        try {
            commandDefinition.handler(parsedArgs);
        } catch (error: any) {
            console.error(`An error occurred while executing the command: ${error.message}`);
        }
    }

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
            for (const alias of aliases) {
                recognizedOptions.set(alias, key);
            }
        }

        let i = 0;
        while (i < args.length) {
            let arg = args[i];
            if (arg.startsWith('--')) {
                let value: string | undefined;
                if (arg.includes('=')) {
                    [arg, value] = arg.split('=');
                }
                const optionKey = recognizedOptions.get(arg);
                if (!optionKey) {
                    console.error(`Unknown option: ${arg}`);
                    return null;
                }

                processedIndices.add(i);

                const fieldType = schemaShape[optionKey];

                if (
                    fieldType instanceof ZodBoolean ||
                    (fieldType instanceof z.ZodOptional && fieldType._def.innerType instanceof ZodBoolean)
                ) {
                    parsedArgs[optionKey] = value ? value === 'true' : true;
                    i++;
                } else if (fieldType instanceof z.ZodArray) {
                    const values = [];
                    i++;
                    while (i < args.length && !args[i].startsWith('-')) {
                        values.push(args[i]);
                        processedIndices.add(i);
                        i++;
                    }
                    parsedArgs[optionKey] = values;
                } else {
                    if (!value) {
                        value = args[i + 1];
                        if (value === undefined || value.startsWith('-')) {
                            console.error(`Option ${arg} requires a value`);
                            return null;
                        }
                        processedIndices.add(i + 1);
                        i++;
                    }
                    parsedArgs[optionKey] = this.parseValue(value, fieldType);
                    i++;
                }
            } else if (arg.startsWith('-') && arg.length > 2) {
                // Handle combined short flags
                const flags = arg.slice(1).split('');
                for (const flag of flags) {
                    const flagArg = `-${flag}`;
                    const optionKey = recognizedOptions.get(flagArg);
                    if (!optionKey) {
                        console.error(`Unknown option: ${flagArg}`);
                        return null;
                    }

                    const fieldType = schemaShape[optionKey];

                    if (
                        fieldType instanceof ZodBoolean ||
                        (fieldType instanceof z.ZodOptional && fieldType._def.innerType instanceof ZodBoolean)
                    ) {
                        parsedArgs[optionKey] = true;
                    } else {
                        const value = args[i + 1];
                        if (value === undefined || value.startsWith('-')) {
                            console.error(`Option ${flagArg} requires a value`);
                            return null;
                        }
                        parsedArgs[optionKey] = this.parseValue(value, fieldType);
                        processedIndices.add(i + 1);
                        i++;
                    }
                }
                processedIndices.add(i);
                i++;
            } else if (arg.startsWith('-')) {
                let value: string | undefined;
                if (arg.includes('=')) {
                    [arg, value] = arg.split('=');
                }
                const optionKey = recognizedOptions.get(arg);
                if (!optionKey) {
                    console.error(`Unknown option: ${arg}`);
                    return null;
                }

                processedIndices.add(i);

                const fieldType = schemaShape[optionKey];

                if (
                    fieldType instanceof ZodBoolean ||
                    (fieldType instanceof z.ZodOptional && fieldType._def.innerType instanceof ZodBoolean)
                ) {
                    parsedArgs[optionKey] = value ? value === 'true' : true;
                    i++;
                } else {
                    if (!value) {
                        value = args[i + 1];
                        if (value === undefined || value.startsWith('-')) {
                            console.error(`Option ${arg} requires a value`);
                            return null;
                        }
                        processedIndices.add(i + 1);
                        i++;
                    }
                    parsedArgs[optionKey] = this.parseValue(value, fieldType);
                    i++;
                }
            } else {
                processedIndices.add(i);
                i++;
            }
        }

        // After parsing options, check for unprocessed arguments
        const unprocessedArgs = args.filter((_, index) => !processedIndices.has(index));
        if (unprocessedArgs.length > 0) {
            console.error(`Unknown argument: ${unprocessedArgs[0]}`);
            return null;
        }

        const validationResult = schema.safeParse(parsedArgs);
        if (!validationResult.success) {
            this.displayValidationErrors(validationResult.error);
            return null;
        }

        return validationResult.data;
    }

    /**
     * Helper method to unwrap Zod schemas that might be wrapped in effects (e.g., refine).
     * @param schema - The Zod schema to unwrap.
     * @returns The unwrapped ZodObject schema.
     */
    private unwrapSchema<T extends z.ZodTypeAny>(schema: T): z.ZodObject<any> {
        if (schema instanceof z.ZodEffects && schema._def.schema instanceof z.ZodObject) {
            return schema._def.schema;
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
            return value === "true" || value === "false" ? value === "true" : value;
        }
        return value;
    }

    /**
     * Display validation errors in a user-friendly way.
     * @param error - The ZodError containing validation issues.
     */
    private displayValidationErrors(error: z.ZodError): void {
        console.error("Argument validation failed:");
        error.issues.forEach(issue => {
            const path = issue.path.join(" -> ") || "Input";
            console.error(`  - ${path}: ${issue.message}`);
        });
    }

    /**
     * Display help for all available commands.
     */
    private displayHelp(): void {
        console.log("Available commands:");
        for (const [commandName, { aliases, schema }] of Object.entries(this.commands)) {
            const description = schema.getDescription() || "No description available";
            const aliasText = aliases.length > 0 ? ` (${aliases.join(", ")})` : '';
            console.log(`  ${commandName}${aliasText}: ${description}`);
        }
        console.log("\nUse --help with a command for more details.");
    }

    /**
     * Display help for a specific command, including its options and descriptions.
     * @param commandName - The name of the command.
     * @param schema - The Zod schema defining the command's options.
     */
    private displayHelpForCommand(commandName: string, schema: z.ZodTypeAny): void {
        const unwrappedSchema = this.unwrapSchema(schema);
        const description = unwrappedSchema.getDescription() || "No description available";
        console.log(`\nUsage: ${commandName} [options]\n`);
        console.log(`${description}\nOptions:`);

        const schemaShape = unwrappedSchema.shape;

        for (const key in schemaShape) {
            const type = schemaShape[key];
            const optionDesc = type.getDescription() || "No description available";
            const aliases = type.getAliases();
            const aliasText = aliases.length > 0 ? ` (${aliases.join(", ")})` : "";
            const isOptional = type.isOptional() ? "(optional)" : "(required)";
            console.log(`  --${key}${aliasText} ${isOptional}: ${optionDesc}`);
        }

        console.log("\nExamples:");
        // Add examples here if needed
    }
}
