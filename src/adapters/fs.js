import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function createFileSystemAdapter() {
  return {
    existsSync: fs.existsSync,
    mkdirSync: fs.mkdirSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
    copyFileSync: fs.copyFileSync,
    readdirSync: fs.readdirSync,
    statSync: fs.statSync,
    rmSync: fs.rmSync,
    resolve: path.resolve,
    join: path.join,
    dirname: path.dirname,
    basename: path.basename,
    homedir: os.homedir,
  };
}
