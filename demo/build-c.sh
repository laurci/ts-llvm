clang-15 -S -emit-llvm main.c -o ./out/main.ll
llc-15 -filetype=obj ./out/main.ll -o ./out/main.o
clang-15 ./out/main.o -o ./out/main

