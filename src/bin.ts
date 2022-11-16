import { Block, createPrinter, Expression, FunctionDeclaration, FunctionMacro, getBuildConfig, getCurrentProgram, isBlock, isFunctionDeclaration, isNumericLiteral, isReturnStatement, isStringLiteral, Node, NumericLiteral, SyntaxKind } from "compiler";
import * as llvm from "llvm-bindings";

import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";

const workDir = path.join(__dirname, "../demo/");
const workPath = (...ps: string[]) => path.join(workDir, ...ps);

if (!fs.existsSync(workPath("out"))) {
    fs.mkdirSync(workPath("out"), { recursive: true });
}

export macro function bin(this: FunctionMacro, _modname: string, _func: () => number) {
    this.transform(({ node, sourceFile }) => {
        const program = getCurrentProgram();
        const checker = program.getTypeChecker();

        const printer = createPrinter();

        function nodeToText(node: Node) {
            return printer.printNode(4 /* EmitHint.Unspecified */, node, sourceFile);
        }

        const modNameParam = node.arguments[0];
        if (!modNameParam || !isStringLiteral(modNameParam)) {
            throw new Error("Expected string literal for first argument");
        }
        const moduleName = modNameParam.text;

        const functionParam = node.arguments[1];
        if (!functionParam) {
            throw new Error("No function provided");
        }

        const functionSymbol = checker.getSymbolAtLocation(functionParam);
        const functionDeclaration = functionSymbol?.valueDeclaration;

        if (!functionDeclaration || !isFunctionDeclaration(functionDeclaration)) {
            throw new Error("No function declaration found");
        }
        console.log("building binary for", moduleName);

        const context = new llvm.LLVMContext();
        const module = new llvm.Module(moduleName, context);
        const builder = new llvm.IRBuilder(context);

        emitFunctionDeclaration(functionDeclaration);

        if (llvm.verifyModule(module)) {
            throw new Error("Module is invalid");
        }

        const modText = module.print();

        if (getBuildConfig()["print.module"]) {
            console.log(modText);
        }

        const modulePath = workPath(moduleName + ".ll");
        const objPath = workPath("out", moduleName + ".o");
        const binPath = workPath("out", moduleName);

        fs.writeFileSync(modulePath, modText);
        child_process.execSync(`llc-14 -filetype=obj ${modulePath} -o ${objPath}`);
        child_process.execSync(`clang-14 ${objPath} -o ${binPath}`);

        function emitFunctionDeclaration(node: FunctionDeclaration) {
            const returnTypeNode = node.type;
            if (!returnTypeNode) {
                throw new Error("No return type");
            }

            const returnType = getLlvmType(returnTypeNode);

            // TODO: handle parameters

            const funcType = llvm.FunctionType.get(returnType, [], false);
            const func = llvm.Function.Create(funcType, llvm.Function.LinkageTypes.ExternalLinkage, "main", module);

            if (!node.body) {
                throw new Error("No function body");
            }
            const block = llvm.BasicBlock.Create(context, "entry", func);
            builder.SetInsertPoint(block);

            emitNode(node.body);

            if (llvm.verifyFunction(func)) {
                throw new Error("Function is invalid");
            }
        }

        function emitNode(node: Node) {
            if (isBlock(node)) {
                return emitBlock(node);
            }

            if (isReturnStatement(node)) {
                if (!node.expression) {
                    builder.CreateRetVoid();
                    return;
                }

                const value = getValueOfExpression(node.expression)
                builder.CreateRet(value);

                return;
            }

            throw new Error(`Unhandled node kind: ${node.kind}`);
        }

        function emitBlock(node: Block) {
            for (const statement of node.statements) {
                emitNode(statement);
            }
        }

        function getValueOfExpression(node: Expression): llvm.Value {
            if (isNumericLiteral(node)) {
                return getValueOfNumericLiteral(node);
            }
            throw new Error("Not implemented");
        }

        function getValueOfNumericLiteral(node: NumericLiteral) {
            const isDouble = node.text.includes(".");

            if (isDouble) {
                return llvm.ConstantFP.get(context, new llvm.APFloat(parseFloat(node.text)));
            } else {
                return llvm.ConstantInt.get(context, new llvm.APInt(32, parseInt(node.text), true));
            }
        }

        function getLlvmType(node: Node) {
            const name = nodeToText(node);

            switch (name) {
                case "i32":
                    return llvm.Type.getInt32Ty(context);

                default:
                    throw new Error(`Unsupported type ${name}`);
            }
        }
    });
}
