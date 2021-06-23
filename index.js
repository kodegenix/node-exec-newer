#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const glob = require('glob')
const { Command, Option } = require('commander')
const { spawn } = require('child_process')

async function run(cmd, args) {
    const options = {}
    options.windowHide = true
    options.stdio = 'inherit'
    options.shell = true
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, options)
        proc.on('error', err => reject(err))
        proc.on('close', code => resolve(code))
    })
}

async function main() {
    const ver = require(path.join(__dirname, 'package.json')).version

    const prog = new Command('rerun')
        .usage('-- command to execute')
        .option('-c, --cwd <path>', 'working directory')
        .addOption(new Option('-s, --source <path...>', 'source files (glob expressions supported)').makeOptionMandatory(true))
        .addOption(new Option('-t, --target <path...>', 'target files (glob expressions supported)').makeOptionMandatory(true))
        .version(ver, '-v, --version', 'output current version')
        .action(rerun)

    try {
        await prog.parseAsync(process.argv)
    } catch (err) {
        console.error(err)
        process.exit(-1)
    }
}

async function rerun() {
    const command = this
    const options = command.opts()

    if (options.cwd) {
        process.chdir(options.cwd)
    }

    let statCache = {}
    let sourceFiles = []
    let targetFiles = []
    let opts = {
        absolute: true,
        stat: true,
        statCache,
    }

    const listFiles = (pat) => new Promise((resolve, reject) => {
        glob(pat, opts, (err, files) => err ? reject(err) : resolve(files))
    })

    for (let pat of options.source) {
        const files = await listFiles(pat)
        sourceFiles = sourceFiles.concat(files)
    }
    for (let pat of options.target) {
        const files = await listFiles(pat)
        targetFiles = targetFiles.concat(files)
    }

    let smtime = new Date(0)
    for (let f of sourceFiles) {
        const stat = statCache[f]
        if (stat && stat.mtime > smtime) {
            smtime = stat.mtime
        }
    }
    let tmtime = new Date(0)
    for (let f of targetFiles) {
        const stat = statCache[f]
        if (stat && stat.mtime > tmtime) {
            tmtime = stat.mtime
        }
    }

    if (smtime > tmtime) {
        console.log(`rerun: executing command '${command.args.join(' ')}'`)
        const cmd = command.args.shift()
        const code = await run(cmd, command.args)
        if (code !== 0) {
            const src = sourceFiles.find(f => statCache[f].isDirectory())
            if (src) {
                let now = new Date()
                await fs.promises.utimes(src, now, now)
                console.log(`rerun: command failed with exit code ${code}, touched folder '${path.relative(process.cwd(), src)}'`)
            }
        }
    }
}

main().catch(console.error)