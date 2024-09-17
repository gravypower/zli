import { z } from 'zod';
// Implement the aliases and description methods
z.ZodType.prototype.aliases = function (...aliases) {
    this._def.aliases = aliases.map(alias => {
        if (alias.length === 1) {
            return `-${alias}`;
        }
        else {
            return `--${alias}`;
        }
    });
    return this;
};
z.ZodType.prototype.getAliases = function () {
    return this._def.aliases || [];
};
z.ZodType.prototype.describe = function (description) {
    this._def.description = description;
    return this;
};
z.ZodType.prototype.getDescription = function () {
    return this._def.description;
};
export { z };
