#! /usr/bin/env bun

import {z, Zli} from "../src";

const AddSchema = z.object({
    name: z.string().describe("The name of the user").aliases("n"),
    age: z.number().min(0, "Age must be a non-negative number").describe("The age of the user (must be a number)").aliases("a"),
    verbose: z.boolean().optional().describe("Enable verbose logging").aliases("v"),
}).describe("Adds a new user to the database");

const RemoveSchema = z.object({
    name: z.string().describe("The name of the user to remove (required)").aliases("n"),
    age: z.number().min(0, "Age must be a non-negative number").optional().describe("The age of the user (must be a number)").aliases("a"),
}).describe("Removes a user from the database");

const ListSchema = z.object({}).describe("Lists all users in the database");

// Initialize the CLI with commands and multiple aliases
const zli = new Zli()
    .addCommand("add", AddSchema, (args) => {
        console.log("Executing add command with args:", args);
    })
    .addCommand("remove", RemoveSchema, (args) => {
        console.log("Executing remove command with args:", args);
    })
    .addCommand("list", ListSchema, () => {
        console.log("Executing list command");
    });

// Parse and handle the CLI arguments
zli.parse(process.argv.slice(2));
