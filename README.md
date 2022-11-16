# jsc

Macro that converts functions to LLVM IR and builds it.

This project is **incomplete**! It can only compile return statements and i32 values.

## Building and runnning

You need to have llvm 14 installed on your system.

To build the project run `yarn build`. The output can be found in the `demo` directory. The binary is `demo/out/test_main`. The generated IR text can be found in `demo/test_main.ll`.
