// zod-extensions.ts
import { z, type ZodTypeDef, type ZodTypeAny } from 'zod';

// Extend Zod to include aliases and methods to access them
declare module 'zod' {
    interface ZodTypeDef {
        aliases?: string[];
        description?: string;
    }

    interface ZodType<Output = any, Def extends ZodTypeDef = ZodTypeDef, Input = Output> {
        aliases(...aliases: string[]): this;
        getAliases(): string[];
        describe(description: string): this;
        getDescription(): string | undefined;
    }
}

// Implement the aliases and description methods
z.ZodType.prototype.aliases = function (...aliases: string[]) {
    (this._def as ZodTypeDef).aliases = aliases.map(alias => {
        if (alias.length === 1) {
            return `-${alias}`;
        } else {
            return `--${alias}`;
        }
    });
    return this;
};

z.ZodType.prototype.getAliases = function () {
    return (this._def as ZodTypeDef).aliases || [];
};

z.ZodType.prototype.describe = function (description: string) {
    (this._def as ZodTypeDef).description = description;
    return this;
};

z.ZodType.prototype.getDescription = function () {
    return (this._def as ZodTypeDef).description;
};
