/**
 * CLI 명령 옵션 정의 테스트
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_OPTION_ALLOWLISTS, validateCommandOptions } from '../../src/cli/commandOptions.js';

describe('COMMAND_OPTION_ALLOWLISTS', () => {
  it('typed 명령의 옵션 검증 정의를 한 곳에서 제공한다', () => {
    expect(COMMAND_OPTION_ALLOWLISTS.products).toContain('pageSize');
    expect(COMMAND_OPTION_ALLOWLISTS.inventory).toContain('keyword');
    expect(COMMAND_OPTION_ALLOWLISTS['gs25-inventory']).toContain('storeKeyword');
    expect(COMMAND_OPTION_ALLOWLISTS.get).toBeUndefined();
  });

  it('명령별 unknown option 검증을 수행한다', () => {
    const errors: string[] = [];

    const rejected = validateCommandOptions('inventory', { store: '강남역' }, (message) => errors.push(message));

    expect(rejected).toBe(true);
    expect(errors.join('\n')).toContain('알 수 없는 옵션: --store');
    expect(errors.join('\n')).toContain('매장명은 --keyword');
  });
});
