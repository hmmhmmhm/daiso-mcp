/**
 * Vitest 설정 파일
 *
 * 테스트 및 코드 커버리지 설정
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 테스트 환경
    environment: 'node',

    // 테스트 파일 패턴
    include: ['tests/**/*.test.ts'],

    // 글로벌 설정 (describe, it, expect 등을 import 없이 사용)
    globals: true,

    // 타입 체크 (선택적)
    typecheck: {
      enabled: false,
    },

    // 커버리지 설정
    coverage: {
      // 커버리지 도구
      provider: 'v8',

      // 리포터 형식
      reporter: ['text', 'text-summary', 'html', 'json'],

      // 커버리지 대상 파일
      include: ['src/**/*.ts'],

      // 커버리지 제외 파일
      exclude: [
        'src/**/*.d.ts',
        'src/core/types.ts', // 타입만 정의
        'src/core/interfaces.ts', // 인터페이스만 정의
        'src/services/**/types.ts', // 타입만 정의
        'src/pages/openapi.ts', // 엔트리 재노출 파일
        'src/bin.ts', // npm bin 진입점 파일
        'src/cli.ts', // 실행 진입점 파일
        'src/cliRenderer.ts', // CLI 출력 렌더러 파일
      ],

      // 커버리지 임계값 (100% 목표)
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },

      // 리포트 디렉토리
      reportsDirectory: './coverage',
    },
  },
});
