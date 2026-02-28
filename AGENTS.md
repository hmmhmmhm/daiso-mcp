# 에이전트 개발 규칙

이 문서는 AI 에이전트가 이 프로젝트에서 코드를 작성하고 기여할 때 따라야 하는 규칙과 가이드라인을 정의합니다.

## 목차

- [코드 작성 규칙](#코드-작성-규칙)
- [커밋 규칙](#커밋-규칙)
- [보안 및 개인정보](#보안-및-개인정보)
- [파일 구조](#파일-구조)
- [코드 스타일](#코드-스타일)
- [문서화](#문서화)
- [테스트](#테스트)

---

## 코드 작성 규칙

### 파일 크기 제한

**모든 코드 파일은 450줄 내외로 작성되어야 합니다.**

- **최대 줄 수**: 450줄
- **권장 줄 수**: 300-400줄
- **초과 시 조치**: 파일이 450줄을 초과하면 기능별로 분리하여 모듈화

#### 파일 분리 예시

```typescript
// ❌ 나쁜 예: 하나의 파일에 모든 기능 (600줄)
// src/products.ts (600줄)

// ✅ 좋은 예: 기능별로 분리
// src/products/search.ts (200줄)
// src/products/filter.ts (150줄)
// src/products/formatter.ts (100줄)
// src/products/index.ts (50줄)
```

### 코드 품질

- **명확성**: 코드는 명확하고 이해하기 쉽게 작성
- **재사용성**: 중복 코드를 최소화하고 공통 로직은 함수로 추출
- **타입 안정성**: TypeScript의 타입 시스템을 적극 활용
- **에러 핸들링**: 모든 비동기 작업과 외부 API 호출에 적절한 에러 처리 구현

#### 예시

```typescript
// ✅ 좋은 예
async function fetchData(url: string): Promise<ApiResponse> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP 에러: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('데이터 가져오기 실패:', error);
    throw error;
  }
}

// ❌ 나쁜 예
async function fetchData(url) {
  const response = await fetch(url);
  return await response.json();
}
```

---

## 커밋 규칙

### 커밋 빈도

- **주기적인 커밋**: 논리적인 작업 단위마다 커밋
- **작은 단위**: 한 번에 하나의 기능이나 수정사항만 포함
- **완성된 코드**: 빌드 실패나 런타임 에러가 없는 상태에서만 커밋

### 커밋 메시지 컨벤션

**접두사는 영어, 메시지는 한국어를 사용합니다.**

#### 커밋 메시지 형식

```
<타입>: <제목>

<본문> (선택사항)

<푸터> (선택사항)
```

#### 타입 종류

- `feat:` - 새로운 기능 추가
- `fix:` - 버그 수정
- `docs:` - 문서 수정
- `style:` - 코드 포맷팅, 세미콜론 누락 등 (로직 변경 없음)
- `refactor:` - 코드 리팩토링 (기능 변경 없음)
- `test:` - 테스트 코드 추가/수정
- `chore:` - 빌드 설정, 패키지 매니저 설정 등
- `perf:` - 성능 개선
- `ci:` - CI/CD 설정 변경
- `revert:` - 커밋 되돌리기

#### 커밋 메시지 예시

```bash
# ✅ 좋은 예
feat: 제품 검색 필터링 기능 추가
fix: 매장 찾기 시 거리 계산 오류 수정
docs: API 사용 예시 문서 업데이트
refactor: 재고 확인 로직을 별도 모듈로 분리
test: 가격 정보 조회 API 테스트 추가
chore: TypeScript 버전 5.7.2로 업데이트

# ❌ 나쁜 예
feat: add feature (영어로만 작성)
update (타입 접두사 누락)
fix: bug fix (구체적이지 않음)
여러 기능 추가 (타입 접두사 누락)
```

#### 제목 작성 규칙

- **명확하고 구체적으로**: 무엇을 변경했는지 명확히 기술
- **50자 이내**: 제목은 간결하게 작성
- **명령형**: "~했음" 대신 "~함" 또는 "~추가" 형태 사용
- **마침표 없음**: 제목 끝에 마침표를 붙이지 않음

#### 본문 작성 규칙 (선택사항)

```bash
feat: 제품 카테고리별 필터링 기능 추가

사용자가 제품을 카테고리별로 필터링할 수 있는 기능을 추가했습니다.
지원 카테고리:
- 주방/생활
- 문구
- 완구/취미
- 화장품/미용

관련 이슈: #123
```

### 커밋 전 체크리스트

커밋하기 전에 다음 사항을 반드시 확인하세요:

- [ ] 코드가 빌드되는가?
- [ ] TypeScript 타입 에러가 없는가?
- [ ] 개인정보나 민감한 정보가 포함되어 있지 않은가?
- [ ] API 키, 비밀번호, 토큰 등이 포함되어 있지 않은가?
- [ ] 테스트가 통과하는가? (테스트가 있는 경우)
- [ ] 주석이 한국어로 작성되어 있는가?
- [ ] 파일이 450줄을 초과하지 않는가?

---

## 보안 및 개인정보

### 절대 커밋하지 말아야 할 항목

**다음 항목들은 절대 Git 저장소에 커밋되어서는 안 됩니다:**

#### 1. 인증 정보

```typescript
// ❌ 절대 금지
const API_KEY = "sk-1234567890abcdef";
const PASSWORD = "mypassword123";
const DATABASE_URL = "postgresql://user:pass@localhost/db";
```

```typescript
// ✅ 올바른 방법: 환경 변수 사용
const API_KEY = process.env.API_KEY;
const PASSWORD = process.env.PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
```

#### 2. 개인정보

- 실제 이메일 주소
- 전화번호
- 주소
- 신용카드 정보
- 주민등록번호
- 기타 식별 가능한 개인정보

#### 3. 민감한 설정 파일

```bash
# ❌ 커밋 금지
.env
.env.local
.env.production
.env.development
secrets.json
credentials.json
service-account-key.json

# ✅ .gitignore에 추가되어 있는지 확인
```

#### 4. 프라이빗 키 및 인증서

- SSH private keys (`id_rsa`, `id_ed25519` 등)
- SSL/TLS 인증서의 private key
- JWT secret keys
- OAuth client secrets

### 환경 변수 사용

민감한 정보는 반드시 환경 변수로 관리하세요.

#### .env.example 파일 제공

```bash
# .env.example (커밋 가능)
API_KEY=your_api_key_here
DATABASE_URL=your_database_url_here
SECRET_KEY=your_secret_key_here
```

```bash
# .env (커밋 금지, .gitignore에 포함)
API_KEY=sk-real-api-key-1234567890
DATABASE_URL=postgresql://user:pass@localhost/db
SECRET_KEY=super-secret-key-xyz
```

### Cloudflare Workers Secrets

Cloudflare Workers 환경 변수는 다음과 같이 관리:

```bash
# 로컬 개발용 (.dev.vars 파일 - .gitignore에 포함)
API_KEY=test-key-for-local-dev

# 프로덕션 배포용 (wrangler를 통해 설정)
npx wrangler secret put API_KEY
```

### 보안 체크리스트

커밋 전 다음 사항을 확인하세요:

- [ ] `.env` 파일이 `.gitignore`에 포함되어 있는가?
- [ ] 하드코딩된 API 키나 비밀번호가 없는가?
- [ ] `console.log()`에 민감한 정보가 출력되지 않는가?
- [ ] 주석에 실제 계정 정보가 포함되어 있지 않는가?
- [ ] 테스트 데이터가 실제 개인정보를 포함하지 않는가?

---

## 파일 구조

### 디렉토리 구조

```
daiso-mcp/
├── src/
│   ├── index.ts              # 메인 서버 파일 (450줄 이하)
│   ├── types/                # 타입 정의
│   ├── tools/                # MCP 도구 구현
│   │   ├── searchProducts.ts # 각 도구별 파일 (450줄 이하)
│   │   ├── findStores.ts
│   │   ├── checkInventory.ts
│   │   └── getPriceInfo.ts
│   ├── services/             # 비즈니스 로직
│   ├── utils/                # 유틸리티 함수
│   └── config/               # 설정 파일
├── examples/                 # 사용 예시
├── tests/                    # 테스트 파일
├── docs/                     # 문서
└── scripts/                  # 빌드/배포 스크립트
```

### 파일 명명 규칙

- **camelCase**: 함수, 변수명
- **PascalCase**: 클래스, 인터페이스, 타입명
- **kebab-case**: 파일명 (선택사항)
- **SCREAMING_SNAKE_CASE**: 상수

```typescript
// 함수, 변수
const userName = 'John';
function getUserData() {}

// 클래스, 인터페이스, 타입
class UserService {}
interface UserData {}
type UserId = string;

// 상수
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = 'https://api.example.com';
```

---

## 코드 스타일

### 주석 작성

**모든 주석은 한국어로 작성합니다.**

#### 파일 헤더 주석

```typescript
/**
 * 제품 검색 도구
 *
 * 다이소 제품을 검색하고 필터링하는 기능을 제공합니다.
 * 검색 조건: 키워드, 카테고리, 가격 범위
 *
 * @module tools/searchProducts
 */
```

#### 함수 주석

```typescript
/**
 * 제품을 검색하고 필터링된 결과를 반환합니다.
 *
 * @param query - 검색 키워드
 * @param category - 제품 카테고리 (선택사항)
 * @param maxPrice - 최대 가격 (선택사항)
 * @returns 검색 결과 객체
 * @throws {Error} API 호출 실패 시
 */
async function searchProducts(
  query: string,
  category?: string,
  maxPrice?: number
): Promise<SearchResult> {
  // 구현
}
```

#### 인라인 주석

```typescript
// 사용자 입력 검증
if (!query || query.trim().length === 0) {
  throw new Error('검색어를 입력해주세요');
}

// TODO: 캐싱 기능 추가 필요
const results = await fetchFromAPI(query);

// FIXME: 대소문자 구분 없이 검색하도록 수정 필요
const filtered = results.filter(item =>
  item.name.includes(query)
);
```

### TypeScript 타입 정의

```typescript
// 인터페이스 정의
interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description?: string; // 선택적 속성
  inStock: boolean;
}

// 타입 별칭
type ProductId = string;
type ProductCategory = '주방/생활' | '문구' | '완구/취미' | '화장품/미용';

// 유니온 타입
type SearchFilter = {
  query: string;
  category?: ProductCategory;
  maxPrice?: number;
};
```

### 코드 포맷팅

- **들여쓰기**: 2 spaces
- **따옴표**: single quotes (`'`) 우선
- **세미콜론**: 사용
- **줄 길이**: 최대 100자 권장

```typescript
// ✅ 좋은 예
const message = '안녕하세요';
const user = {
  name: '홍길동',
  age: 30,
};

// ❌ 나쁜 예
const message="안녕하세요"
const user={name:"홍길동",age:30}
```

---

## 문서화

### README.md

프로젝트의 메인 문서로 다음 내용을 포함:

- 프로젝트 개요
- 설치 방법
- 사용 방법
- API 문서
- 배포 가이드

### API 문서

각 도구의 입력/출력 스키마를 명확히 문서화:

```typescript
/**
 * 제품 검색 API
 *
 * 요청 예시:
 * ```json
 * {
 *   "name": "search_products",
 *   "arguments": {
 *     "query": "수납박스",
 *     "category": "주방/생활",
 *     "maxPrice": 5000
 *   }
 * }
 * ```
 *
 * 응답 예시:
 * ```json
 * {
 *   "content": [{
 *     "type": "text",
 *     "text": "{ ... }"
 *   }]
 * }
 * ```
 */
```

### CHANGELOG.md (권장)

주요 변경사항을 기록:

```markdown
# Changelog

## [1.1.0] - 2025-03-01

### Added
- 제품 카테고리별 필터링 기능 추가
- 가격 히스토리 조회 기능 추가

### Fixed
- 매장 찾기 시 거리 계산 오류 수정

### Changed
- API 응답 형식 개선
```

---

## 테스트

### 테스트 작성 원칙

- **모든 도구는 테스트를 작성**해야 합니다
- **엣지 케이스**를 고려한 테스트 작성
- **에러 처리** 로직도 테스트

### 테스트 파일 명명

```
src/tools/searchProducts.ts
tests/tools/searchProducts.test.ts
```

### 테스트 예시

```typescript
import { searchProducts } from '../src/tools/searchProducts';

describe('제품 검색', () => {
  test('키워드로 제품을 검색할 수 있다', async () => {
    const result = await searchProducts({ query: '수납박스' });
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
  });

  test('존재하지 않는 제품은 빈 결과를 반환한다', async () => {
    const result = await searchProducts({ query: '존재하지않는제품xyz' });
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(0);
  });

  test('빈 검색어는 에러를 발생시킨다', async () => {
    await expect(
      searchProducts({ query: '' })
    ).rejects.toThrow();
  });
});
```

---

## 체크리스트 요약

### 코드 작성 전

- [ ] 어떤 기능을 구현할지 명확히 이해했는가?
- [ ] 파일이 450줄을 초과하지 않도록 설계했는가?
- [ ] 적절한 파일 구조와 모듈 분리를 계획했는가?

### 코드 작성 중

- [ ] TypeScript 타입을 명확히 정의했는가?
- [ ] 주석을 한국어로 작성했는가?
- [ ] 에러 핸들링을 적절히 구현했는가?
- [ ] 보안에 취약한 코드가 없는가?

### 커밋 전

- [ ] 빌드가 성공하는가?
- [ ] 타입 에러가 없는가?
- [ ] 개인정보나 민감한 정보가 포함되지 않았는가?
- [ ] 커밋 메시지가 컨벤션을 따르는가?
- [ ] 파일이 450줄 이하인가?

### 커밋 메시지 작성 시

```bash
# 형식 확인
<타입>: <한국어 제목>

# 예시
feat: 제품 검색 필터링 기능 추가
fix: 매장 거리 계산 오류 수정
docs: API 사용 가이드 업데이트
```

---

## 참고 자료

- [Conventional Commits](https://www.conventionalcommits.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [MCP Documentation](https://modelcontextprotocol.io/)

---

**이 규칙을 따라 일관되고 안전하며 유지보수 가능한 코드를 작성해주세요.**
