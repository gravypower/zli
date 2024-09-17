// src/zli/zli.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import sinon from 'sinon';
import { z } from 'zod';
import '../src/zod';
import {Zli} from "../src"; // Ensure extensions are loaded

describe('Zli Class', () => {
    let zli: Zli;
    let consoleLogSpy: sinon.SinonSpy;
    let consoleErrorSpy: sinon.SinonSpy;

    beforeEach(() => {
        zli = new Zli();
        consoleLogSpy = sinon.spy(console, 'log');
        consoleErrorSpy = sinon.spy(console, 'error');
    });

    afterEach(() => {
        consoleLogSpy.restore();
        consoleErrorSpy.restore();
    });

    it('should display help when no arguments are provided', () => {
        zli.parse([]);
        expect(consoleLogSpy.called).toBe(true);
        expect(consoleLogSpy.firstCall.args[0]).toContain('Available commands:');
    });

    it('should display help when --help is provided', () => {
        zli.parse(['--help']);
        expect(consoleLogSpy.called).toBe(true);
        expect(consoleLogSpy.firstCall.args[0]).toContain('Available commands:');
    });

    it('should display error for unknown command', () => {
        zli.parse(['unknown']);
        expect(consoleErrorSpy.calledWith('Unknown command: unknown')).toBe(true);
        expect(consoleLogSpy.called).toBe(true);
        expect(consoleLogSpy.firstCall.args[0]).toContain('Available commands:');
    });

    it('should execute the correct handler for a command', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({});
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test']);
        expect(handlerMock.called).toBe(true);
    });

    it('should pass parsed arguments to the handler', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            name: z.string().aliases('n'),
            age: z.number().aliases('a'),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--name', 'Alice', '--age', '30']);
        expect(handlerMock.calledWith({ name: 'Alice', age: 30 })).toBe(true);
    });

    it('should handle command aliases', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({});
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['t']);
        expect(handlerMock.called).toBe(true);
        handlerMock.resetHistory();
        zli.parse(['alias']);
        expect(handlerMock.called).toBe(true);
    });

    it('should validate required arguments', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            name: z.string(),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test']);
        expect(consoleErrorSpy.called).toBe(true);
        expect(handlerMock.called).toBe(false);
    });

    it('should handle boolean flags', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            verbose: z.boolean().optional().aliases('v'),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--verbose']);
        expect(handlerMock.calledWith({ verbose: true })).toBe(true);
    });

    it('should display command-specific help when validation fails', () => {
        const schema = z.object({
            name: z.string(),
        }).describe('Test command');
        zli.addCommand('test', schema, () => {});
        zli.parse(['test']);
        expect(consoleErrorSpy.called).toBe(true);
        expect(consoleLogSpy.called).toBe(true);
        expect(consoleLogSpy.firstCall.args[0]).toContain('Usage: test [options]');
    });

    it('should report an error for unknown options', () => {
        zli.addCommand('test', z.object({}), () => {});
        zli.parse(['test', '--unknown']);
        expect(consoleErrorSpy.calledWith('Unknown option: --unknown')).toBe(true);
    });

    it('should report an error when required arguments are missing', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--name', 'Alice']);
        expect(consoleErrorSpy.called).toBe(true);
        expect(consoleErrorSpy.firstCall.args[0]).toContain('Argument validation failed:');
        expect(handlerMock.called).toBe(false);
    });

    it('should handle optional arguments correctly when omitted', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            verbose: z.boolean().optional(),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test']);
        expect(handlerMock.calledWith({})).toBe(true);
    });

    it('should parse options provided in --option=value format', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--name=Alice', '--age=30']);
        expect(handlerMock.calledWith({ name: 'Alice', age: 30 })).toBe(true);
    });

    it('should handle boolean flags with explicit values', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            verbose: z.boolean().optional(),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--verbose=false']);
        expect(handlerMock.calledWith({ verbose: false })).toBe(true);
    });

    it('should display command-specific help when --help is provided after a command', () => {
        const schema = z.object({}).describe('Test command');
        zli.addCommand('test', schema, () => {});
        zli.parse(['test', '--help']);
        expect(consoleLogSpy.called).toBe(true);
        expect(consoleLogSpy.firstCall.args[0]).toContain('Usage: test [options]');
        expect(consoleLogSpy.firstCall.args[0]).toContain('Test command');
    });

    it('should handle multiple aliases for options', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            name: z.string().aliases('n', 'fullname'),
        });
        zli.addCommand('test', schema, handlerMock);

        zli.parse(['test', '--name', 'Alice']);
        expect(handlerMock.calledWith({ name: 'Alice' })).toBe(true);

        handlerMock.resetHistory();
        zli.parse(['test', '-n', 'Bob']);
        expect(handlerMock.calledWith({ name: 'Bob' })).toBe(true);

        handlerMock.resetHistory();
        zli.parse(['test', '--fullname', 'Charlie']);
        expect(handlerMock.calledWith({ name: 'Charlie' })).toBe(true);
    });

    it('should report validation errors for invalid input', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            age: z.number().min(18, 'Must be at least 18').max(99, 'Must be under 100'),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--age', '15']);
        expect(consoleErrorSpy.called).toBe(true);
        expect(consoleErrorSpy.firstCall.args[0]).toContain('Argument validation failed:');
        expect(consoleErrorSpy.firstCall.args[0]).toContain('Must be at least 18');
        expect(handlerMock.called).toBe(false);
    });

    it('should execute commands with no options', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({});
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test']);
        expect(handlerMock.calledWith({})).toBe(true);
    });

    it('should handle exceptions thrown in handlers', () => {
        const error = new Error('Handler error');
        const handlerMock = sinon.stub().throws(error);
        const schema = z.object({});
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test']);
        expect(consoleErrorSpy.calledWith(`An error occurred while executing the command: ${error.message}`)).toBe(true);
    });

    it('should report an error when conflicting options are used together', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            force: z.boolean().optional(),
            interactive: z.boolean().optional(),
        }).refine((data) => !(data.force && data.interactive), {
            message: 'Cannot use --force and --interactive together',
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--force', '--interactive']);
        expect(consoleErrorSpy.called).toBe(true);
        expect(consoleErrorSpy.firstCall.args[0]).toContain('Cannot use --force and --interactive together');
        expect(handlerMock.called).toBe(false);
    });

    it('should display properly formatted help output', () => {
        const schema = z.object({
            name: z.string().describe('Your name').aliases('n'),
            age: z.number().describe('Your age').aliases('a'),
        }).describe('Test command');
        zli.addCommand('test', schema, () => {});
        zli.parse(['test', '--help']);
        expect(consoleLogSpy.called).toBe(true);
        const output = consoleLogSpy.firstCall.args[0];
        expect(output).toContain('Usage: test [options]');
        expect(output).toContain('Test command');
        expect(output).toContain('--name (-n) (required): Your name');
        expect(output).toContain('--age (-a) (required): Your age');
    });

    it('should parse and validate different data types', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            count: z.number(),
            enabled: z.boolean(),
            tags: z.array(z.string()).optional(),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--count', '5', '--enabled', '--tags', 'tag1', 'tag2']);
        expect(handlerMock.calledWith({
            count: 5,
            enabled: true,
            tags: ['tag1', 'tag2'],
        })).toBe(true);
    });

    it('should report an error when extra unknown arguments are provided', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            name: z.string(),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--name', 'Alice', 'extraArg']);
        expect(consoleErrorSpy.calledWith('Unknown argument: extraArg')).toBe(true);
        expect(handlerMock.called).toBe(false);
    });

    it('should report an error when required options are provided with empty values', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            name: z.string().nonempty('Name cannot be empty'),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--name', '']);
        expect(consoleErrorSpy.called).toBe(true);
        expect(consoleErrorSpy.firstCall.args[0]).toContain('Name cannot be empty');
        expect(handlerMock.called).toBe(false);
    });

    it('should use the last occurrence of an option if specified multiple times', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            name: z.string(),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--name', 'Alice', '--name', 'Bob']);
        expect(handlerMock.calledWith({ name: 'Bob' })).toBe(true);
    });

    it('should handle combined short flags', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            a: z.boolean().aliases('a'),
            b: z.boolean().aliases('b'),
            c: z.boolean().aliases('c'),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '-abc']);
        expect(handlerMock.calledWith({ a: true, b: true, c: true })).toBe(true);
    });

    it('should display help when a command is expected but not provided', () => {
        zli.addCommand('test', z.object({}), () => {});
        zli.parse([]);
        expect(consoleLogSpy.called).toBe(true);
        expect(consoleLogSpy.firstCall.args[0]).toContain('Available commands:');
    });

    it('should handle options with long names', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            'long-option-name': z.string(),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--long-option-name', 'value']);
        expect(handlerMock.calledWith({ 'long-option-name': 'value' })).toBe(true);
    });

    it('should handle options with multiple dashes', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            'weird-option': z.string(),
        });
        zli.addCommand('test', schema, handlerMock);
        zli.parse(['test', '--weird-option', 'value']);
        expect(handlerMock.calledWith({ 'weird-option': 'value' })).toBe(true);
    });

    it('should handle comma-separated arrays in --tags=value1,value2 format', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            tags: z.array(z.string()).describe('A list of tags'),
        });

        const zli = new Zli();
        zli.addCommand('test', schema, handlerMock);

        // Parse the --tags=tag1,tag2 format
        zli.parse(['test', '--tags=tag1,tag2']);

        // Ensure the handler is called with the correct array
        expect(handlerMock.calledWith({ tags: ['tag1', 'tag2'] })).toBe(true);
    });

    it('should handle space-separated arrays for tags', () => {
        const handlerMock = sinon.spy();
        const schema = z.object({
            tags: z.array(z.string()).describe('A list of tags'),
        });

        const zli = new Zli();
        zli.addCommand('test', schema, handlerMock);

        // Parse space-separated array values
        zli.parse(['test', '--tags', 'tag1', 'tag2']);

        // Ensure the handler is called with the correct array
        expect(handlerMock.calledWith({ tags: ['tag1', 'tag2'] })).toBe(true);
    });
});
