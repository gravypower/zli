// index.ts
import { z, type ZodTypeAny, ZodBoolean, ZodNumber } from 'zod';

// CommandDefinition now uses generics for type safety
interface CommandDefinition<T extends z.ZodTypeAny> {
    schema: T;
    handler: (args: z.infer<T>) => void;
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
class Zli {
    private commands: Record<string, CommandDefinition<z.ZodTypeAny>> = {};

    /**
     * Add a new command to the CLI with variable aliases.
     * @param commandName - The primary name of the command.
     * @param schema - The Zod schema defining expected options.
     * @param handler - The function to execute when the command is called.
     * @returns The Zli instance for chaining.
     */
    addCommand<T extends z.ZodTypeAny>(
        commandName: string,
        schema: T,
        handler: (args: z.infer<T>) => void
    ): this {
        this.commands[commandName] = { schema, handler };
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
            [cmdName].includes(subcommand)
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

        const parsedArgs = this.processArguments(options, commandDefinition.schema);
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
     * Process options using the provided Zod schema.
     * @param args - The array of arguments to parse.
     * @param schema - The Zod schema defining expected options.
     * @returns The parsed and validated arguments, or null if validation fails.
     */
    private processArguments<T extends z.ZodTypeAny>(args: string[], schema: T): z.infer<T> | null {
        const schemaObject = this.resolveSchema(schema);
        const schemaShape = schemaObject.shape;
        const schemaKeys = Object.keys(schemaShape);

        const parsedArgs: Record<string, any> = {};
        const processedIndices = new Set<number>();

        // Map option names and aliases to schema keys
        const optionAliasMap = new Map<string, string>();
        for (const key of schemaKeys) {
            const field = schemaShape[key];
            const aliases = field.getAliases();
            optionAliasMap.set(`--${key}`, key);
            optionAliasMap.set(`-${key}`, key); // Add short option with single dash
            for (const alias of aliases) {
                optionAliasMap.set(alias, key);
            }
        }

        // Use a `for` loop with `continue` for better readability and control
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            if (arg.startsWith('--')) {
                // Process long options
                const result = this.processOptionValue(arg, args, i, optionAliasMap, schemaShape, processedIndices);
                if (!result.success) return null;

                const { optionKey, fieldType, value } = result;
                if (fieldType instanceof ZodBoolean || this.isOptionalBoolean(fieldType)) {
                    parsedArgs[optionKey] = value === 'true';
                    continue; // Move to the next iteration
                } else if (fieldType instanceof z.ZodArray) {
                    parsedArgs[optionKey] = value ? value.split(',') : this.processArrayArgs(args, i);
                    continue;
                } else {
                    parsedArgs[optionKey] = this.parseValue(value!, fieldType);
                    i = result.newIndex - 1; // Adjust index for `for` loop
                    continue;
                }
            }

            if (arg.startsWith('-') && arg.length > 2) {
                // Process combined short flags
                i = this.processCombinedShortFlags(arg, args, i, optionAliasMap, schemaShape, parsedArgs, processedIndices) - 1;
                continue;
            }

            console.error(`Unknown argument: ${arg}`);
            this.shouldDisplayHelp = true;
            return null;
        }

        const validationResult = schema.safeParse(parsedArgs);
        if (!validationResult.success) {
            this.showValidationErrors(validationResult.error);
            this.shouldDisplayHelp = true;
            return null;
        }

        return validationResult.data;
    }

    /**
     * Helper method to handle combined short flags (e.g., `-abc`).
     */
    private processCombinedShortFlags(
        arg: string,
        args: string[],
        i: number,
        optionAliasMap: Map<string, string>,
        schemaShape: Record<string, ZodTypeAny>,
        parsedArgs: Record<string, any>,
        processedIndices: Set<number>
    ): number {
        const flags = arg.slice(1).split(''); // Split combined flags, e.g. '-abc' -> ['a', 'b', 'c']
        processedIndices.add(i); // Mark current index as processed
        i++; // Move to the next argument

        for (const flag of flags) {
            const flagArg = `-${flag}`;
            const result = this.processOptionValue(flagArg, args, i - 1, optionAliasMap, schemaShape, processedIndices);

            if (!result.success) {
                this.shouldDisplayHelp = true;
                return i; // Exit early if any option fails
            }

            const { optionKey, fieldType } = result;

            if (fieldType instanceof ZodBoolean || this.isOptionalBoolean(fieldType)) {
                parsedArgs[optionKey] = true; // Boolean flags are true if present
            } else {
                if (i >= args.length || args[i].startsWith('-')) {
                    console.error(`Option ${flagArg} requires a value`);
                    this.shouldDisplayHelp = true;
                    return i; // Exit early on error
                }
                const val = args[i];
                processedIndices.add(i);
                i++;
                parsedArgs[optionKey] = this.parseValue(val, fieldType);
            }
        }

        return i;
    }

    /**
     * Helper method to parse individual options.
     */
    private processOptionValue(
        arg: string,
        args: string[],
        i: number,
        optionAliasMap: Map<string, string>,
        schemaShape: Record<string, ZodTypeAny>,
        processedIndices: Set<number>
    ): ParseOptionResult {
        let value: string | undefined;
        if (arg.includes('=')) {
            [arg, value] = arg.split('=');
        }
        const optionKey = optionAliasMap.get(arg);
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

        if (fieldType instanceof ZodBoolean || this.isOptionalBoolean(fieldType)) {
            value = value ? value : 'true';
            return { optionKey, fieldType, value, newIndex: i, success: true };
        } else if (fieldType instanceof z.ZodArray) {
            // For array options, we let processArguments handle the values
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
    private resolveSchema<T extends z.ZodTypeAny>(schema: T): z.ZodObject<any> {
        if (schema instanceof z.ZodEffects) {
            return this.resolveSchema(schema._def.schema);
        } else if (schema instanceof z.ZodObject) {
            return schema;
        } else {
            throw new Error('Unsupported schema type');
        }
    }

    /**
     * Check if a field is an optional boolean.
     */
    private isOptionalBoolean(fieldType: ZodTypeAny): boolean {
        return (
            fieldType instanceof ZodBoolean ||
            (fieldType instanceof z.ZodOptional && fieldType._def.innerType instanceof ZodBoolean)
        );
    }

    /**
     * Parse values based on their Zod type.
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
     * Process array arguments for options that expect multiple values.
     */
    private processArrayArgs(args: string[], index: number): string[] {
        const values: string[] = [];
        for (let i = index; i < args.length && !args[i].startsWith('-'); i++) {
            values.push(args[i]);
        }
        return values;
    }

    /**
     * Display validation errors in a user-friendly way.
     * @param error - The ZodError containing validation issues.
     */
    private showValidationErrors(error: z.ZodError): void {
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
        for (const [commandName, { schema }] of Object.entries(this.commands)) {
            const description = schema.getDescription() || 'No description available';
            helpMessage += `  ${commandName}: ${description}\n`;
        }
        helpMessage += '\nUse --help with a command for more details.';
        console.log(helpMessage);
    }

    /**
     * Display help for a specific command.
     * @param commandName - The name of the command.
     * @param schema - The Zod schema defining the command's options.
     */
    private displayHelpForCommand(commandName: string, schema: z.ZodTypeAny): void {
        const schemaObject = this.resolveSchema(schema);
        const description = schemaObject.getDescription() || 'No description available';
        let helpMessage = `\nUsage: ${commandName} [options]\n\n`;
        helpMessage += `${description}\n\nOptions:\n`;

        const schemaShape = schemaObject.shape;

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


export { Zli };
export * from './zod';