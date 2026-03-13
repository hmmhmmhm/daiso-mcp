# -*- coding: utf-8 -*-
# CLI 전용 Ghidra headless 결과 추출 스크립트
# analyzeHeadless -postScript 로 실행됨

import json
import traceback

from ghidra.app.decompiler import DecompInterface


def _write_json(path, obj):
    text = json.dumps(obj, ensure_ascii=False)
    f = open(path, 'w')
    try:
        f.write(text)
    finally:
        f.close()


def _list_functions(program, limit):
    out = []
    it = program.getFunctionManager().getFunctions(True)
    count = 0
    while it.hasNext():
        fn = it.next()
        out.append({
            'name': fn.getName(),
            'entry': str(fn.getEntryPoint()),
            'signature': str(fn.getSignature()),
        })
        count += 1
        if limit > 0 and count >= limit:
            break
    return out


def _list_strings(program, limit):
    out = []
    listing = program.getListing()
    it = listing.getDefinedData(True)
    count = 0
    while it.hasNext():
        d = it.next()
        val = d.getValue()
        if val is None:
            continue
        s = str(val)
        if len(s) == 0:
            continue
        out.append({
            'address': str(d.getAddress()),
            'value': s,
        })
        count += 1
        if limit > 0 and count >= limit:
            break
    return out


def _decompile_function(program, function_name):
    fn = None
    it = program.getFunctionManager().getFunctions(True)
    while it.hasNext():
        f = it.next()
        if f.getName() == function_name:
            fn = f
            break

    if fn is None:
        return {
            'found': False,
            'error': 'function not found: ' + function_name,
        }

    decomp = DecompInterface()
    decomp.openProgram(program)
    res = decomp.decompileFunction(fn, 30, monitor)
    if res is None or (not res.decompileCompleted()):
        return {
            'found': True,
            'error': 'decompilation failed',
        }

    cfunc = res.getDecompiledFunction()
    if cfunc is None:
        return {
            'found': True,
            'error': 'decompiled function is null',
        }

    return {
        'found': True,
        'name': fn.getName(),
        'entry': str(fn.getEntryPoint()),
        'c': cfunc.getC(),
    }


def run():
    args = getScriptArgs()
    if len(args) < 2:
        printerr('Usage: headless_export.py <action> <output_json> [arg1] [arg2]')
        return

    action = args[0]
    output_json = args[1]
    arg1 = args[2] if len(args) > 2 else ''

    result = {
        'ok': False,
        'action': action,
    }

    try:
        program = currentProgram
        if program is None:
            result['error'] = 'no current program'
            _write_json(output_json, result)
            return

        if action == 'list_functions':
            limit = int(arg1) if arg1 else 200
            result['ok'] = True
            result['functions'] = _list_functions(program, limit)
        elif action == 'list_strings':
            limit = int(arg1) if arg1 else 200
            result['ok'] = True
            result['strings'] = _list_strings(program, limit)
        elif action == 'decompile_function':
            if not arg1:
                result['error'] = 'missing function name'
            else:
                dec = _decompile_function(program, arg1)
                result['ok'] = dec.get('found', False) and ('c' in dec)
                result['decompile'] = dec
        else:
            result['error'] = 'unknown action: ' + action
    except Exception as e:
        result['error'] = str(e)
        result['traceback'] = traceback.format_exc()

    _write_json(output_json, result)


run()
