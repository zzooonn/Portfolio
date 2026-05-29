# BUAA OS 2019 — MIPS 운영체제 완전 정리

> **용도**: 면접 기술 질문 대비 / 전체 개념 복습  
> **기반**: BUAA-OS-2019 실습 (lab0 ~ lab6), MIPS R3000 아키텍처  
> **구성**: 각 lab 핵심 개념 → 구현 포인트 → 면접 예상 질문 + 모범 답변

---

## 목차

1. [전체 아키텍처 한눈에 보기](#0-전체-아키텍처-한눈에-보기)
2. [lab0 — 개발 환경 & 쉘 기초](#lab0--개발-환경--쉘-기초)
3. [lab1 — 커널 부트스트랩 & ELF 로더](#lab1--커널-부트스트랩--elf-로더)
4. [lab2 — 물리 메모리 관리 & TLB](#lab2--물리-메모리-관리--tlb)
5. [lab3 — 프로세스 관리 & 스케줄러](#lab3--프로세스-관리--스케줄러)
6. [lab4 — 시스템 콜 & fork & IPC & pipe](#lab4--시스템-콜--fork--ipc--pipe)
7. [lab5 — 파일 시스템 서버](#lab5--파일-시스템-서버)
8. [lab6 — 쉘 & spawn & 파이프라인](#lab6--쉘--spawn--파이프라인)
9. [면접 핵심 질문 모음](#면접-핵심-질문-모음)
10. [MIPS 아키텍처 빠른 참조](#mips-아키텍처-빠른-참조)

---

## 0. 전체 아키텍처 한눈에 보기

```
┌─────────────────────────────────────────────────────┐
│                   사용자 공간 (ULIM 이하)              │
│   sh.c   fork.c   ipc.c   pipe.c   fd.c   file.c    │
│                  ↕ 시스템 콜 (syscall.S)              │
├─────────────────────────────────────────────────────┤
│                   커널 공간 (KERNBASE 이상)            │
│  sched.c  env.c  pmap.c  traps.c  syscall_all.c     │
│                  ↕ 하드웨어 추상화                     │
├─────────────────────────────────────────────────────┤
│       MIPS R3000 하드웨어 (GXemul 에뮬레이터)          │
│        TLB  /  CP0 레지스터  /  타이머 인터럽트         │
└─────────────────────────────────────────────────────┘
```

### 메모리 레이아웃 (mmu.h 기준)

| 주소 범위 | 영역 | 설명 |
|---|---|---|
| `0x80000000` 이상 | KERNBASE | 커널 코드/데이터 |
| `0x7f400000` | TIMESTACK | 타이머 인터럽트 전용 스택 |
| `0x7f3fe000` | KSTACKTOP | 커널 스택 상단 |
| `0x40000000` | ULIM | 유저/커널 경계선 |
| `0x3ffff000` | UVPT | 유저 가상 페이지 테이블 |
| `0x10000000` | USTACKTOP | 유저 스택 상단 |
| `0x00000000` | 하단 | 유저 코드 시작 |

### 핵심 파일 구조

```
BUAA-OS-2019/
├── boot/start.S          # CPU 초기화, 커널 스택 설정
├── mm/pmap.c             # 물리 메모리 관리 (lab2 핵심)
├── mm/tlb_asm.S          # TLB miss 핸들러
├── lib/env.c             # 프로세스(Env) 관리
├── lib/sched.c           # 라운드로빈 스케줄러
├── lib/syscall_all.c     # 시스템 콜 구현체
├── lib/traps.c           # 예외/인터럽트 처리
├── lib/genex.S           # 예외 진입점 (어셈블리)
├── fs/serv.c             # 파일 시스템 서버 (lab5)
├── fs/fs.c               # 블록 캐시, 파일 관리
├── user/fork.c           # COW fork 구현
├── user/ipc.c            # IPC 래퍼
├── user/pipe.c           # 파이프 구현
└── user/sh.c             # 쉘 (lab6 최종)
```

---

## lab0 — 개발 환경 & 쉘 기초

### 핵심 내용

- **목적**: 리눅스 기본 명령어, 쉘 스크립트, Makefile 이해
- **주요 작업**: `fibo.c` (피보나치), `sh_test/` 스크립트 작성
- **브랜치**: `origin/lab0` — `src/`, `dst/` 디렉토리만 존재

### 알아야 할 배경 지식

**Makefile 동작 방식**
```makefile
target: dependency
    command   # 탭 문자로 시작해야 함
```
- `make`는 타임스탬프를 보고 변경된 파일만 재컴파일한다.
- `-C` 플래그로 서브디렉토리 재귀 빌드 가능.

**GXemul 에뮬레이터**
- MIPS R3000 CPU를 소프트웨어로 에뮬레이션
- `gxemul/r3000` 바이너리로 OS 이미지 실행

---

## lab1 — 커널 부트스트랩 & ELF 로더

### 핵심 내용

- **목적**: 커널이 어떻게 메모리에 올라오고 실행되는지 이해
- **신규 파일**: `boot/start.S`, `init/init.c`, `lib/printf.c`, `readelf/`
- **브랜치**: `origin/lab1` — OS 뼈대 최초 생성

### 개념 1: 부트 과정 (boot/start.S)

```asm
# 커널 스택 설정 (0x80400000)
lui  sp, 0x8040      # sp = 0x80400000

# CP0 레지스터 초기화
mtc0 zero, CP0_STATUS    # 인터럽트 비활성화
mtc0 zero, CP0_WATCHLO
mtc0 zero, CP0_WATCHHI

# 캐시 비활성화
mfc0 t0, CP0_CONFIG
and  t0, ~0x7
ori  t0, 0x2
mtc0 t0, CP0_CONFIG
```

**부팅 순서**:
1. 전원 ON → MIPS 하드웨어가 `0xBFC00000`에서 첫 명령 실행
2. `start.S` — 스택 설정, CP0 초기화
3. `init/init.c`의 `mips_init()` 호출
4. 메모리 탐지 → 페이지 테이블 초기화 → 프로세스 생성

### 개념 2: ELF 바이너리 구조

ELF(Executable and Linkable Format)는 리눅스/MIPS 실행 파일 포맷이다.

```
ELF 파일 구조:
┌──────────────┐
│  ELF Header  │  매직 넘버(0x7f ELF), 아키텍처, 진입점 주소
├──────────────┤
│ Program Hdrs │  어떤 세그먼트를 어느 주소에 로드할지
├──────────────┤
│  .text       │  실행 코드
│  .data       │  초기화된 전역 변수
│  .bss        │  초기화되지 않은 전역 변수 (파일에 없음)
├──────────────┤
│ Section Hdrs │  디버깅/링킹 정보
└──────────────┘
```

**readelf 과제 핵심**: ELF 헤더에서 `e_phoff`(프로그램 헤더 오프셋)와 `e_phnum`(헤더 개수)을 읽고, 각 `Phdr`의 `p_vaddr`, `p_filesz`, `p_memsz`를 출력.

### 개념 3: 링커 스크립트 (tools/scse0_3.lds)

커널을 `0x80010000`에 배치하도록 지시한다:
```ld
. = 0x80010000;   /* 커널 시작 가상 주소 */
.text : { *(.text) }
.data : { *(.data) }
```

### 면접 예상 질문

**Q. 컴퓨터 전원을 켜면 OS가 어떻게 메모리에 올라오나요?**

> MIPS의 경우 전원 인가 시 하드웨어가 고정된 주소(`0xBFC00000`)에서 실행을 시작합니다. 이 주소에 있는 부트 코드(`start.S`)가 CPU 레지스터 초기화, 커널 스택 설정을 수행한 뒤 C 언어로 작성된 커널 초기화 함수(`mips_init()`)를 호출합니다. 실제 OS 이미지는 ELF 포맷으로 저장되어 있고, 부트로더가 ELF 헤더를 파싱해서 각 세그먼트를 지정된 가상 주소로 복사합니다.

**Q. ELF 파일의 .bss 섹션이 파일에 없는 이유는?**

> `.bss`는 초기화되지 않은 전역 변수를 담는 섹션으로, 모든 값이 0으로 초기화됩니다. 파일에 실제 0 바이트를 저장하면 낭비이므로 ELF 헤더에 "이 크기만큼의 공간이 필요하다"는 메타데이터만 남기고, 로더가 메모리에 올릴 때 `bzero()`로 해당 영역을 초기화합니다.

---

## lab2 — 물리 메모리 관리 & TLB

### 핵심 내용

- **목적**: 물리 페이지 할당/해제, 2단계 페이지 테이블, TLB 관리
- **신규 파일**: `mm/pmap.c` (712줄), `mm/tlb_asm.S`, `include/pmap.h`
- **브랜치**: `origin/lab2`

### 개념 1: 가상 주소 → 물리 주소 변환

```
가상 주소 (32비트)
┌──────────┬──────────┬────────────┐
│  PDX(10) │  PTX(10) │  OFFSET(12)│
└──────────┴──────────┴────────────┘
     │            │
     ▼            ▼
  페이지 디렉토리  페이지 테이블 엔트리(PTE)
  인덱스           인덱스
     │
     ▼
  pgdir[PDX] → 페이지 테이블 물리 주소
                    │
                    ▼
               pgtable[PTX] → 물리 페이지 번호 + 플래그
                                   │
                                   ▼
                              물리 주소 = PPN << 12 | OFFSET
```

**매크로 정의 (pmap.h)**:
```c
#define PDX(va)    (((va) >> 22) & 0x3FF)   // 상위 10비트
#define PTX(va)    (((va) >> 12) & 0x3FF)   // 중간 10비트
#define PPN(pa)    ((pa) >> 12)              // 물리 페이지 번호
#define PTE_ADDR(pte) ((pte) & ~0xFFF)      // PTE에서 주소 추출
```

### 개념 2: struct Page — 물리 페이지 추적

```c
struct Page {
    LIST_ENTRY(Page) pp_link;  // free list 연결
    u_short pp_ref;            // 참조 카운트 (몇 개의 PTE가 이 페이지를 가리키는가)
};
```

`pages[]` 배열 = 물리 메모리의 각 4KB 페이지를 대표하는 구조체 배열.  
페이지 구조체와 물리 주소 변환:
```c
page2pa(pp) = (pp - pages) << PGSHIFT    // 구조체 → 물리 주소
pa2page(pa) = &pages[PPN(pa)]            // 물리 주소 → 구조체
```

### 개념 3: 핵심 함수 흐름

**`page_alloc()`** — 비어있는 물리 페이지 하나를 할당:
```c
// free list에서 페이지 꺼내기
pp = LIST_FIRST(&page_free_list);
LIST_REMOVE(pp, pp_link);
bzero(page2kva(pp), BY2PG);  // 초기화
return pp;
```

**`pgdir_walk()`** — 가상 주소에 대한 PTE 포인터 반환:
```c
// 1단계: 페이지 디렉토리에서 페이지 테이블 찾기
Pde *pde = &pgdir[PDX(va)];
if (!(*pde & PTE_V)) {
    // 페이지 테이블이 없으면 생성 (create 플래그가 1일 때)
    page_alloc(&pp);
    *pde = page2pa(pp) | PTE_V | PTE_R;
}
// 2단계: 페이지 테이블에서 PTE 반환
Pte *pgtable = (Pte *)KADDR(PTE_ADDR(*pde));
return &pgtable[PTX(va)];
```

**`page_insert()`** — 가상 주소와 물리 페이지를 매핑:
```c
pte = pgdir_walk(pgdir, va, 1);   // PTE 찾기/생성
if (*pte & PTE_V) page_remove(...);  // 기존 매핑 제거
*pte = page2pa(pp) | perm | PTE_V;  // 새 매핑 설정
pp->pp_ref++;                        // 참조 카운트 증가
tlb_invalidate(pgdir, va);           // TLB 무효화
```

### 개념 4: MIPS TLB (핵심 차이점)

**x86 vs MIPS TLB 처리 방식**:

| 항목 | x86 | MIPS |
|---|---|---|
| TLB miss 처리 | 하드웨어가 자동으로 페이지 테이블 탐색 | **소프트웨어(OS)가 직접 처리** |
| TLB miss 예외 | 발생 안 함 | `UTLB miss` 예외 발생 |
| 유연성 | 낮음 (페이지 테이블 구조 고정) | 높음 (OS가 원하는 구조 사용 가능) |

**MIPS TLB miss 처리 흐름** (`tlb_asm.S`):
```
가상 주소 접근
    │
    ▼
TLB에 해당 항목 없음 → UTLB miss 예외 (벡터 0x80000000)
    │
    ▼
tlb_refill 핸들러:
  1. CP0_BADVADDR에서 잘못된 주소 읽기
  2. 페이지 테이블에서 PTE 검색
  3. TLB에 새 항목 쓰기 (tlbwr 명령)
  4. 원래 명령 재실행
```

**CP0 주요 레지스터**:
```
CP0_STATUS   : 인터럽트 활성화/비활성화, 커널/유저 모드
CP0_CAUSE    : 예외 원인 코드
CP0_EPC      : 예외 발생 시 프로그램 카운터 (복귀 주소)
CP0_BADVADDR : 잘못된 메모리 접근 주소
CP0_ENTRYHI  : TLB 검색 키 (VPN + ASID)
CP0_ENTRYLO  : TLB 항목 값 (PPN + 플래그)
```

### 면접 예상 질문

**Q. 가상 주소를 물리 주소로 변환하는 과정을 설명하세요.**

> 먼저 CPU가 가상 주소를 TLB에서 검색합니다. TLB hit이면 바로 물리 주소를 얻고, miss면 페이지 테이블 워크를 수행합니다. 이 OS에서는 2단계 페이지 테이블을 사용하는데, 가상 주소의 상위 10비트가 페이지 디렉토리 인덱스(PDX), 중간 10비트가 페이지 테이블 인덱스(PTX), 하위 12비트가 페이지 내 오프셋입니다. `pgdir[PDX]`에서 페이지 테이블의 물리 주소를 얻고, 그 페이지 테이블의 `pgtable[PTX]`에서 물리 페이지 번호(PPN)를 얻어 오프셋과 합쳐 최종 물리 주소가 됩니다.

**Q. TLB란 무엇이고, MIPS에서 miss가 발생하면 어떻게 처리되나요?**

> TLB(Translation Lookaside Buffer)는 가상-물리 주소 변환 결과를 캐싱하는 하드웨어입니다. x86은 하드웨어가 자동으로 페이지 테이블을 탐색하지만, MIPS는 TLB miss 시 소프트웨어(OS 커널)가 직접 처리합니다. MIPS TLB miss가 발생하면 UTLB 예외가 발생하고, 커널의 `tlb_refill` 핸들러가 `CP0_BADVADDR`에서 잘못된 주소를 읽어 페이지 테이블에서 해당 PTE를 찾아 TLB에 `tlbwr` 명령으로 쓴 뒤 원래 명령을 재실행합니다. 이 방식은 구현이 복잡하지만 OS가 원하는 페이지 테이블 구조를 자유롭게 사용할 수 있다는 장점이 있습니다.

**Q. pp_ref(참조 카운트)는 왜 필요한가요?**

> 하나의 물리 페이지가 여러 가상 주소에 매핑될 수 있습니다 (예: fork 후 COW 페이지, 공유 메모리). `pp_ref`는 "이 물리 페이지를 가리키는 PTE가 몇 개인가"를 추적합니다. `page_remove()`로 매핑을 제거할 때 `pp_ref--`를 하고, 0이 되면 실제로 페이지를 free list에 반환합니다. `pp_ref`가 없으면 아직 사용 중인 페이지를 해제하는 버그가 생길 수 있습니다.

---

## lab3 — 프로세스 관리 & 스케줄러

### 핵심 내용

- **목적**: 프로세스 생성/전환, 라운드로빈 스케줄링, 예외 처리
- **신규 파일**: `lib/env.c`, `lib/sched.c`, `lib/traps.c`, `lib/syscall_all.c`, `lib/genex.S`, `lib/kclock.c`
- **브랜치**: `origin/lab3`

### 개념 1: struct Env — 프로세스 제어 블록(PCB)

```c
struct Env {
    struct Trapframe env_tf;   // 레지스터 저장 공간 (컨텍스트 스위치 시 사용)
    LIST_ENTRY(Env) env_link;  // free list 연결
    u_int env_id;              // 프로세스 고유 ID
    u_int env_parent_id;       // 부모 프로세스 ID
    u_int env_status;          // ENV_FREE / ENV_RUNNABLE / ENV_NOT_RUNNABLE
    Pde *env_pgdir;            // 프로세스 페이지 디렉토리 (가상 주소 공간)
    u_int env_cr3;             // 페이지 디렉토리 물리 주소
    LIST_ENTRY(Env) env_sched_link;  // 스케줄러 리스트 연결
    u_int env_pri;             // 우선순위 (타임 슬라이스 크기)
    // IPC 관련 필드 (lab4에서 사용)
    u_int env_ipc_value;
    u_int env_ipc_from;
    u_int env_ipc_recving;
    u_int env_ipc_dstva;
    u_int env_ipc_perm;
    // pgfault 관련 (lab4)
    u_int env_pgfault_handler;
    u_int env_xstacktop;
    // 스케줄러 카운터
    u_int env_runs;
};
```

> **면접 팁**: "`struct Env`는 리눅스의 `task_struct` 축소판입니다"라고 말하면 면접관이 바로 이해합니다.

### 개념 2: 컨텍스트 스위치

**Trapframe** — 프로세스의 레지스터 상태를 저장하는 구조체:
```c
struct Trapframe {
    u_long regs[32];  // MIPS 32개 범용 레지스터
    u_long cp0_status;
    u_long hi, lo;    // 곱셈/나눗셈 결과 레지스터
    u_long cp0_badvaddr;
    u_long cp0_cause;
    u_long cp0_epc;   // 예외 발생 시 PC (여기서 재실행)
    u_long pc;        // 현재 실행 중인 PC
};
```

**컨텍스트 스위치 흐름**:
```
타이머 인터럽트 발생
    │
    ▼
genex.S: SAVE_ALL 매크로로 모든 레지스터를 Trapframe에 저장
    │
    ▼
traps.c: handle_int() → sched_yield() 호출
    │
    ▼
sched.c: 다음 실행할 Env 선택
    │
    ▼
env_run(next_env):
  - curenv->env_tf = *현재 Trapframe (상태 저장)
  - lcr3(next_env->env_cr3)  (페이지 테이블 교체)
  - env_pop_tf(&next_env->env_tf)  (레지스터 복원 후 복귀)
```

### 개념 3: 라운드로빈 스케줄러 (sched.c)

```c
// env_sched_list[0]: 실행 대기 큐 (현재 라운드)
// env_sched_list[1]: 다음 라운드 큐
static u_int cur_lasttime = 1;
static int cur_head_index = 0;

void sched_yield(void) {
    cur_lasttime--;
    if (cur_lasttime == 0 || curenv == NULL) {
        // 타임 슬라이스 소진 → 현재 프로세스를 다음 라운드 큐로
        LIST_INSERT_HEAD(&env_sched_list[!cur_head_index], curenv, ...);
        
        // 현재 큐가 비면 큐 전환
        if (LIST_EMPTY(&env_sched_list[cur_head_index]))
            cur_head_index = !cur_head_index;
        
        // 다음 프로세스 선택
        next_env = LIST_FIRST(&env_sched_list[cur_head_index]);
        LIST_REMOVE(next_env, ...);
        cur_lasttime = next_env->env_pri;  // 우선순위 = 타임 슬라이스 크기
        env_run(next_env);
    }
    env_run(curenv);  // 아직 슬라이스 남아있으면 계속 실행
}
```

**핵심**: `env_pri`가 높을수록 더 오래 CPU를 점유한다. 두 개의 큐를 번갈아 사용하는 이유는 우선순위 처리를 간단히 하기 위함이다.

### 개념 4: 예외 처리 구조

```
예외 발생 (주소 0x80000080으로 점프)
    │
    ▼
genex.S: SAVE_ALL → sp를 커널 스택으로 변경
    │
    ▼
traps.c: exception_handlers[ExcCode] 호출
    │
    ├─ ExcCode=0 (인터럽트) → handle_int() → sched_yield()
    ├─ ExcCode=1 (TLB Mod)  → handle_tlb() → pgfault 처리
    ├─ ExcCode=2/3 (TLB miss) → tlb_refill()
    ├─ ExcCode=8 (Syscall)  → handle_sys() → syscall_all.c
    └─ 기타 → handle_reserved()
```

**타이머 인터럽트 설정** (`kclock.c`):
```c
// GXemul의 실시간 클록 레지스터에 값을 써서 인터럽트 주기 설정
*(volatile int *)KCLOCK_NINTER = 200;  // 200ms마다 인터럽트
```

### 면접 예상 질문

**Q. PCB에 어떤 정보가 담겨 있고 왜 필요한가요?**

> PCB(Process Control Block)는 프로세스의 실행 상태를 완전히 복원하는 데 필요한 모든 정보를 저장합니다. 이 OS에서는 `struct Env`가 PCB 역할을 하며, 레지스터 스냅샷(`env_tf`), 가상 주소 공간 정보(`env_pgdir`), 프로세스 상태(`env_status`), 우선순위(`env_pri`) 등을 포함합니다. 컨텍스트 스위치 시 현재 프로세스의 레지스터를 `env_tf`에 저장하고, 다음 프로세스의 `env_tf`에서 복원함으로써 각 프로세스가 "중단된 지점부터" 재개될 수 있습니다.

**Q. 컨텍스트 스위치가 일어나는 시점과 과정을 설명하세요.**

> 주로 타이머 인터럽트가 발생할 때 일어납니다. 인터럽트가 발생하면 CPU가 자동으로 `CP0_EPC`에 현재 PC를 저장하고 예외 벡터(`0x80000080`)로 점프합니다. `genex.S`의 `SAVE_ALL` 매크로가 32개 범용 레지스터와 CP0 레지스터를 모두 현재 Trapframe에 저장합니다. 그 다음 `sched_yield()`가 호출되어 다음 실행할 프로세스를 선택하고, `env_run()`에서 새 프로세스의 페이지 테이블로 교체(`lcr3`)한 뒤 저장된 Trapframe을 복원하고 `eret` 명령으로 유저 모드로 복귀합니다.

**Q. 라운드로빈 스케줄러의 문제점은 무엇인가요?**

> 첫째, 실시간 응답이 필요한 프로세스(예: 오디오 처리)와 일반 배치 작업을 구분하지 못합니다. 둘째, I/O를 많이 기다리는 프로세스가 CPU를 거의 사용하지 않아도 같은 타임 슬라이스를 받습니다. 이를 개선한 것이 Linux의 CFS(Completely Fair Scheduler)나 우선순위 기반 스케줄러입니다. 이 OS에서는 `env_pri`로 간단한 우선순위를 구현했습니다.

---

## lab4 — 시스템 콜 & fork & IPC & pipe

### 핵심 내용

- **목적**: 유저 공간 프로그램 실행, 시스템 콜 인터페이스, 프로세스 간 통신
- **신규 파일**: `user/` 전체 (`fork.c`, `ipc.c`, `pipe.c`, `pgfault.c` 등), `lib/syscall_all.c` 구현 완성
- **브랜치**: `origin/lab4`

### 개념 1: 시스템 콜 흐름

```
유저 코드: syscall_mem_alloc(0, va, perm)
    │
    ▼
user/syscall_lib.c: msyscall(SYS_mem_alloc, 0, va, perm, 0, 0)
    │
    ▼
user/syscall_wrap.S:
    addiu v0, zero, SYS_mem_alloc  # 시스템 콜 번호를 v0에
    syscall                         # MIPS SYSCALL 명령 → ExcCode=8 예외 발생
    │
    ▼ (커널 모드 진입)
lib/genex.S: SAVE_ALL (레지스터 저장)
    │
    ▼
lib/traps.c: handle_sys()
    │
    ▼
lib/syscall_all.c: sys_dispatch()
    switch(syscall_number):
      case SYS_mem_alloc → sys_mem_alloc()
      case SYS_mem_map   → sys_mem_map()
      case SYS_yield     → sys_yield() → sched_yield()
      ...
```

**주요 시스템 콜 목록**:
```c
sys_mem_alloc(envid, va, perm)   // 가상 주소에 물리 페이지 할당
sys_mem_map(srcid, srcva, dstid, dstva, perm)  // 페이지 공유
sys_mem_unmap(envid, va)         // 매핑 해제
sys_env_alloc()                  // 자식 프로세스 생성 (fork 내부)
sys_set_env_status(envid, status) // 프로세스 상태 변경
sys_set_pgfault_handler(envid, func, xstacktop) // 페이지 폴트 핸들러 등록
sys_ipc_recv(dstva)              // IPC 메시지 대기
sys_ipc_can_send(envid, val, srcva, perm) // IPC 메시지 전송
sys_yield()                      // 자발적 CPU 양보
```

### 개념 2: COW fork (핵심 중 핵심)

**COW(Copy-On-Write)**란 "쓰기가 발생할 때만 페이지를 복사한다"는 최적화 기법이다.

**fork() 동작 과정**:
```
부모 프로세스가 fork() 호출
    │
    ▼
1. sys_env_alloc()으로 자식 프로세스 생성
    │
    ▼
2. 부모의 모든 유저 주소 공간 페이지를 순회
   각 페이지에 대해:
   - PTE_R(쓰기 가능) 페이지 → PTE_COW 플래그로 교체 (읽기 전용으로 변경)
   - sys_mem_map()으로 같은 물리 페이지를 자식에게도 매핑 (PTE_COW)
    │
    ▼
3. 자식의 pgfault 핸들러 등록 (pgfault 함수)
    │
    ▼
4. 자식을 RUNNABLE 상태로 변경
```

**COW 쓰기 발생 시**:
```
자식(또는 부모)이 COW 페이지에 쓰기 시도
    │
    ▼
TLB Mod 예외 발생 (읽기 전용 페이지 쓰기 시도)
    │
    ▼
커널: env_pgfault_handler가 등록되어 있으면
      유저 공간의 pgfault() 함수 호출
    │
    ▼
user/fork.c의 pgfault():
  1. PTE_COW 플래그 확인 (COW 페이지인지 검증)
  2. 임시 주소(USTACKTOP)에 새 페이지 할당
  3. 기존 COW 페이지 내용을 새 페이지에 복사
  4. 원래 가상 주소에 새 페이지 매핑 (쓰기 가능하게)
  5. 임시 주소 매핑 해제
```

**왜 TLB Mod 예외인가?**
- TLB Mod = "TLB 수정 예외" = 읽기 전용(PTE_R 없음)으로 매핑된 페이지에 쓰기 시도
- COW 페이지는 PTE_COW로 마킹되고 쓰기 권한이 제거됨
- 쓰기 시도 → TLB Mod 예외 → 커널이 pgfault 핸들러 호출

### 개념 3: IPC (프로세스 간 통신)

이 OS의 IPC는 **공유 메모리 + 메시지 패싱** 방식이다.

```c
// 수신 측: sys_ipc_recv()
// - env_ipc_recving = 1로 설정 후 NOT_RUNNABLE 상태로 블록
// - 공유 페이지 매핑 주소(dstva)도 등록

// 송신 측: sys_ipc_can_send(target_envid, value, srcva, perm)
// - 수신 측이 ready 상태인지 확인 (env_ipc_recving == 1)
// - value 값 전달
// - srcva != 0이면 페이지 매핑도 공유
// - 수신 측을 다시 RUNNABLE 상태로 변경
```

**주의**: send와 recv 중 recv가 먼저 대기한다. 수신자가 준비되지 않은 상태에서 send를 보내면 실패(-E_IPC_NOT_RECV)를 반환하고 재시도해야 한다.

### 개념 4: pipe — 경쟁 조건 해결

pipe는 **공유 메모리 페이지 하나**로 구현된다.

```c
struct Pipe {
    u_int p_rpos;           // 읽기 위치
    u_int p_wpos;           // 쓰기 위치
    u_char p_buf[BY2PIPE];  // 32바이트 순환 버퍼
};
```

**pipe의 EOF 감지 (핵심 경쟁 조건)**:

```c
// pipe_is_closed() — 파이프가 닫혔는지 확인
static int _pipeisclosed(struct Fd *fd, struct Pipe *p) {
    // pageref(fd) == 이 fd 페이지를 가리키는 PTE 수
    // pageref(pipe_data) == pipe 데이터 페이지를 가리키는 PTE 수
    
    // fd 페이지 참조 수 < pipe 데이터 페이지 참조 수
    // → 다른 쪽 end가 닫혔다 (fd는 공유 안 했지만 data는 공유)
    return pageref(fd) == pageref(pipe_data);
}
```

**경쟁 조건 발생 시나리오**:
1. 프로세스 A: write end를 닫기 시작 (fd unmap 중)
2. 스케줄러 전환
3. 프로세스 B: `pipe_is_closed()` 확인 → fd 참조수 감소됐지만 data 참조수는 아직 감소 안 됨 → 아직 열려있다고 판단 (잘못된 판단)

**해결책** (`lab6` 완성): `env_runs`를 추적하여 스케줄러 전환이 일어났는지 감지하고, 일어났다면 재확인.

### 면접 예상 질문

**Q. fork()에서 COW가 어떻게 동작하는지 설명하세요.**

> fork() 시 자식 프로세스를 생성하고 부모의 모든 페이지를 실제로 복사하는 대신, 같은 물리 페이지를 공유하되 쓰기 권한을 제거하고 PTE_COW 플래그를 설정합니다. 이후 부모나 자식이 해당 페이지에 쓰려고 하면 TLB Mod 예외가 발생합니다. 그 시점에 pgfault 핸들러가 호출되어 해당 페이지의 내용을 새 물리 페이지에 복사하고, 원래 가상 주소에 새 페이지를 쓰기 가능하게 매핑합니다. 이렇게 하면 실제로 쓰기가 발생할 때만 복사가 이루어져 메모리와 시간을 절약합니다.

**Q. 시스템 콜이 호출되면 내부적으로 어떤 일이 벌어지나요?**

> 유저 코드에서 `syscall_mem_alloc()` 같은 래퍼 함수가 MIPS `syscall` 명령을 실행합니다. 이 명령은 ExcCode=8인 예외를 발생시켜 CPU가 커널 모드로 전환되고 예외 벡터로 점프합니다. `genex.S`가 모든 레지스터를 Trapframe에 저장하고, `handle_sys()`가 `v0` 레지스터에 있는 시스템 콜 번호를 읽어 `syscall_all.c`의 해당 함수로 디스패치합니다. 처리 완료 후 결과값을 Trapframe의 v0에 저장하고 `eret`으로 유저 모드로 복귀합니다.

**Q. pipe에서 EOF를 어떻게 감지하나요? pageref를 설명해주세요.**

> pipe의 쓰기 end가 닫혔는지 감지하기 위해 `pageref()`를 사용합니다. pipe는 fd 페이지와 data 페이지 두 페이지로 구성됩니다. 정상 상태에서는 두 페이지의 참조 수가 같습니다. 그런데 쓰기 end를 닫으면 해당 fd 페이지의 참조 수만 먼저 감소합니다. `pageref(fd) == pageref(data)`가 되면 — 즉, 공유 중인 fd가 모두 닫혔다는 뜻이므로 — EOF로 판단합니다. 다만 close() 도중 스케줄러 전환이 일어나면 일시적으로 불일치가 발생해 잘못 판단할 수 있어 `env_runs`로 재확인하는 방어 로직이 필요합니다.

---

## lab5 — 파일 시스템 서버

### 핵심 내용

- **목적**: 유저 공간 파일 시스템 서버 구현 (마이크로커널 스타일)
- **신규 파일**: `fs/serv.c` (319줄), `fs/fs.c`, `fs/ide.c`, `user/fsipc.c`
- **브랜치**: `origin/lab5`

### 개념 1: 마이크로커널 vs 모놀리식 커널

| 항목 | 모놀리식 커널 (Linux) | 마이크로커널 (이 OS) |
|---|---|---|
| 파일 시스템 위치 | 커널 내부 | **유저 공간 서버 프로세스** |
| 통신 방식 | 함수 호출 (빠름) | IPC 메시지 (느리지만 안전) |
| 버그 영향 | 파일 시스템 버그 = 커널 크래시 | 파일 서버만 재시작 가능 |
| 대표 OS | Linux, Windows | MINIX, QNX, seL4 |

### 개념 2: 파일 시스템 서버 구조

```
일반 프로세스 (예: cat)
    │
    │ open("/motd", O_RDONLY)
    ▼
user/file.c: fd_alloc() → fsipc_open() 호출
    │
    ▼
user/fsipc.c: IPC로 파일 서버에 요청 전송
    │
    ▼ (IPC)
fs/serv.c: serve() 루프
    │
    ├─ FSREQ_OPEN  → serve_open()  → file_open() in fs.c
    ├─ FSREQ_READ  → serve_read()  → file_read() in fs.c
    ├─ FSREQ_WRITE → serve_write() → file_write() in fs.c
    ├─ FSREQ_STAT  → serve_stat()
    └─ FSREQ_CLOSE → serve_close()
```

**파일 서버 메인 루프**:
```c
void serve(void) {
    u_int req, whom, perm;
    for (;;) {
        // IPC로 요청 대기 (페이지 매핑도 함께 받음)
        req = ipc_recv(&whom, REQVA, &perm);
        
        // 요청 타입에 따라 처리 함수 호출
        switch (req) {
            case FSREQ_OPEN:  serve_open(whom, ...); break;
            case FSREQ_READ:  serve_read(whom, ...); break;
            // ...
        }
    }
}
```

### 개념 3: 블록 캐시

파일 시스템은 디스크 블록을 가상 주소에 매핑하여 캐싱한다:

```c
// 디스크 블록 n → 가상 주소 변환
#define DISKMAP 0x10000000
void *diskaddr(u_int blockno) {
    return (void *)(DISKMAP + blockno * BY2BLK);
}

// 블록 읽기 (캐시 없으면 디스크에서 읽어옴)
void *read_block(u_int blockno) {
    void *blk = diskaddr(blockno);
    if (block_is_mapped(blockno)) return blk;  // 캐시 히트
    // 캐시 미스: 페이지 할당 후 IDE 디스크에서 읽기
    sys_mem_alloc(0, blk, PTE_V | PTE_R);
    ide_read(blockno * SECT2BLK, blk, SECT2BLK);
    return blk;
}
```

### 개념 4: 파일 디스크립터 레이어

```
유저 코드: read(fd_num, buf, n)
    │
    ▼
user/fd.c: fd_lookup(fd_num) → struct Fd *fd
    │
    ▼
fd->fd_dev → struct Dev (devfile, devpipe, devcons 중 하나)
    │
    ▼
dev->dev_read(fd, buf, n, offset) 호출
  → devfile의 경우 → fsipc_read() → 파일 서버 IPC
  → devpipe의 경우 → 공유 메모리 직접 접근
```

### 면접 예상 질문

**Q. 파일 시스템을 유저 공간에 구현한 이유는 무엇인가요?**

> 이 OS는 마이크로커널 설계를 따라 파일 시스템을 독립된 유저 공간 서버 프로세스로 구현했습니다. 이 방식의 장점은 파일 시스템 코드의 버그가 커널 전체를 다운시키지 않고 서버 프로세스만 영향을 받는다는 점입니다. 또한 서버를 재시작하는 것만으로 복구가 가능하여 안정성이 높아집니다. 단점은 파일 I/O마다 IPC 통신이 발생해 모놀리식 커널의 함수 호출보다 오버헤드가 크다는 점입니다.

**Q. open() 호출이 파일 서버까지 어떻게 전달되나요?**

> 유저가 `open("/motd", O_RDONLY)`를 호출하면 `user/file.c`가 fd를 할당하고, `fsipc_open()`을 통해 IPC 메시지를 파일 서버(`fs/serv.c`)로 전송합니다. 파일 서버는 무한 루프(`serve()`)에서 IPC를 대기하고 있다가 `FSREQ_OPEN` 메시지를 받으면 `serve_open()`을 호출하여 `fs/fs.c`의 `file_open()`으로 실제 파일을 찾습니다. 결과(파일 메타데이터 페이지)를 IPC로 응답하면 `open()`이 완료됩니다.

---

## lab6 — 쉘 & spawn & 파이프라인

### 핵심 내용

- **목적**: 완전한 사용자 인터페이스 완성, 프로세스 exec, 파이프 파싱
- **신규 파일**: `user/sh.c` (289줄), `user/spawn.c`, `user/wait.c`, `user/cat.c`, `user/echo.c`, `user/ls.c`
- **브랜치**: `origin/lab6`

### 개념 1: spawn() — exec 대체

MIPS UNIX와 달리 이 OS에는 `exec()` 시스템 콜이 없다. 대신 `spawn()`이 비슷한 역할을 한다.

```
exec() 방식 (Linux): 현재 프로세스 공간을 새 ELF로 덮어씀
spawn() 방식 (이 OS): 
  1. fork()로 자식 프로세스 생성
  2. 자식의 주소 공간을 새 ELF 이미지로 교체
  3. 부모는 원래 코드 계속 실행
```

```c
int spawn(char *prog, char **argv) {
    // 1. 파일 서버에서 ELF 파일 열기
    fd = open(prog, O_RDONLY);
    
    // 2. 자식 프로세스 생성
    child = sys_env_alloc();
    
    // 3. ELF 세그먼트를 자식의 가상 주소 공간에 매핑
    elf_load_seg(...);
    
    // 4. 자식 스택 설정 (argc, argv)
    init_stack(child, argv, ...);
    
    // 5. 자식 실행 시작
    sys_set_env_status(child, ENV_RUNNABLE);
    return child;
}
```

### 개념 2: 쉘 파이프라인 파싱 (sh.c)

```
명령어: ls | grep foo > out.txt

파싱 결과:
┌──────┐  pipe  ┌───────────┐  redir  ┌─────────┐
│  ls  │ ─────▶ │ grep foo  │ ──────▶ │ out.txt │
└──────┘        └───────────┘         └─────────┘
```

**파이프 처리 흐름**:
```c
// sh.c의 runcmd()
case '|':
    // 파이프 생성
    pipe(p);
    
    // 왼쪽 명령 실행 (write end 사용)
    if (fork() == 0) {
        dup(p[1], 1);   // stdout → pipe write end
        close(p[0]); close(p[1]);
        runcmd(left_cmd);
    }
    
    // 오른쪽 명령 실행 (read end 사용)
    if (fork() == 0) {
        dup(p[0], 0);   // stdin → pipe read end
        close(p[0]); close(p[1]);
        runcmd(right_cmd);
    }
    
    close(p[0]); close(p[1]);
    wait(child1); wait(child2);
```

### 개념 3: wait() 구현

```c
void wait(u_int envid) {
    const volatile struct Env *e = &envs[ENVX(envid)];
    while (e->env_id == envid && e->env_status != ENV_FREE) {
        // sys_yield()로 CPU 양보하며 폴링
        sys_yield();
    }
}
```

`env_runs`를 사용해 타임 슬라이스 전환을 감지하는 방어 로직이 추가되어 pipe 경쟁 조건도 이 단계에서 최종 해결된다.

### 면접 예상 질문

**Q. spawn()과 fork()의 차이는 무엇인가요?**

> fork()는 현재 프로세스를 그대로 복제하여 부모와 동일한 코드를 실행하는 자식을 만듭니다. spawn()은 fork()를 내부적으로 호출하지만 자식의 주소 공간을 새 ELF 프로그램으로 교체합니다. Linux의 `fork() + exec()` 조합과 유사하지만, 이 OS에는 `exec()` 시스템 콜이 없어 spawn()이 그 역할을 합니다. 실제로는 spawn()이 새 프로그램을 실행하는 주요 수단이고, fork()는 IPC나 pipe 처리를 위한 병렬 실행에 사용됩니다.

**Q. `ls | grep foo`는 내부적으로 어떻게 동작하나요?**

> 쉘이 파이프(`|`)를 파싱하면, 먼저 `pipe()` 시스템 콜로 읽기/쓰기 fd 쌍을 생성합니다. 그 다음 두 개의 자식 프로세스를 fork합니다. 왼쪽 자식(`ls`)은 표준 출력(fd 1)을 파이프 쓰기 end로 교체(dup)한 뒤 실행하고, 오른쪽 자식(`grep foo`)은 표준 입력(fd 0)을 파이프 읽기 end로 교체한 뒤 실행합니다. `ls`의 출력이 파이프 버퍼를 거쳐 `grep`의 입력으로 전달됩니다. 쓰기 end가 닫히면(ls 종료) grep이 EOF를 감지하고 종료합니다.

---

## 면접 핵심 질문 모음

### 🔴 최빈출 (반드시 준비)

**Q1. 가상 메모리가 필요한 이유는 무엇인가요?**

> 첫째, 각 프로세스가 독립된 주소 공간을 가질 수 있어 서로의 메모리를 침범하지 않습니다(보호). 둘째, 물리 메모리보다 큰 주소 공간을 사용할 수 있습니다(추상화). 셋째, 메모리 단편화를 줄이고 불연속적인 물리 페이지를 연속적인 가상 주소로 매핑할 수 있습니다. 이 OS에서는 ULIM(`0x40000000`) 이하를 유저 공간, 이상을 커널 공간으로 구분하여 프로세스가 커널 메모리에 직접 접근하지 못하도록 합니다.

**Q2. COW(Copy-On-Write)를 왜 사용하나요?**

> `fork()` 시 부모의 주소 공간 전체를 즉시 복사하면 — 예를 들어 부모가 1GB 메모리를 사용 중이라면 — 자식 생성에 시간과 메모리가 많이 소요됩니다. 실제로는 fork 직후 자식이 `exec()`를 호출하는 경우가 많아 복사가 낭비가 됩니다. COW는 쓰기가 발생할 때만 페이지를 복사하므로 평균적으로 훨씬 효율적입니다. 쓰기가 없으면 복사 자체가 일어나지 않습니다.

**Q3. 페이지 폴트가 발생하면 어떻게 처리되나요?**

> 페이지 폴트는 유효하지 않은 가상 주소에 접근하거나 권한 없는 페이지에 쓰려 할 때 발생합니다. MIPS에서는 TLB miss(유효하지 않은 PTE) 또는 TLB Mod(읽기 전용 페이지 쓰기) 예외로 구분됩니다. 커널은 예외 원인을 확인하고 적절히 처리합니다. COW 페이지의 경우 TLB Mod 예외가 발생하면 유저 공간의 pgfault 핸들러를 호출해 페이지를 복사합니다. 완전히 잘못된 주소 접근이면 프로세스를 종료(SIGSEGV)합니다.

**Q4. 프로세스와 스레드의 차이는 무엇인가요?**

> 프로세스는 독립된 가상 주소 공간을 가지며, 다른 프로세스의 메모리에 직접 접근할 수 없습니다. 스레드는 같은 프로세스 내에서 주소 공간을 공유하며, 힙과 전역 변수를 함께 사용합니다. 이 OS에서는 `struct Env`로 프로세스를 구현했고, 스레드는 구현되지 않았습니다. 실제 커널(Linux)에서는 `clone()` 시스템 콜의 플래그로 주소 공간 공유 여부를 결정하여 프로세스와 스레드를 통합 구현합니다.

**Q5. 데드락이 발생하는 조건은 무엇인가요?**

> 데드락은 네 가지 조건이 동시에 충족될 때 발생합니다: 상호 배제(한 번에 하나의 프로세스만 자원 사용), 점유 대기(자원을 갖고 있으면서 추가 자원을 대기), 비선점(자원을 강제로 빼앗을 수 없음), 순환 대기(프로세스들이 서로의 자원을 기다리는 사이클). 이 OS의 IPC에서는 수신자가 먼저 대기하는 프로토콜로 순환 대기를 방지했습니다.

### 🟡 심화 질문 (추가 준비)

**Q6. 인터럽트와 예외의 차이는 무엇인가요?**

> 인터럽트(Interrupt)는 CPU 외부 하드웨어(타이머, 디스크, 네트워크 카드 등)가 발생시키는 비동기 이벤트입니다. 현재 실행 중인 명령과 무관하게 발생합니다. 예외(Exception)는 CPU가 명령을 실행하는 중에 동기적으로 발생하는 이벤트입니다(잘못된 주소 접근, 0으로 나누기, syscall 등). MIPS에서는 두 가지 모두 같은 예외 메커니즘으로 처리되며, `CP0_CAUSE`의 ExcCode 필드로 구분합니다(0 = 인터럽트, 8 = 시스템 콜, 2/3 = TLB miss 등).

**Q7. 커널 공간과 유저 공간을 왜 분리하나요?**

> 운영체제의 핵심 코드와 데이터를 유저 프로세스로부터 보호하기 위해서입니다. 유저 프로세스가 임의로 커널 메모리를 읽거나 쓸 수 있다면 다른 프로세스의 민감한 데이터를 훔치거나 시스템을 크래시시킬 수 있습니다. MIPS에서는 `CP0_STATUS`의 KSU 비트로 커널/유저 모드를 구분하고, 유저 모드에서는 ULIM(`0x40000000`) 이상의 주소에 접근하면 예외가 발생합니다.

**Q8. 세마포어와 뮤텍스의 차이는?**

> 뮤텍스는 소유권 개념이 있어 lock을 건 스레드만 unlock할 수 있는 이진(binary) 락입니다. 세마포어는 카운터 기반으로 여러 스레드가 동시에 접근 가능한 자원 수를 제어합니다(counting semaphore). 예를 들어 DB 커넥션 풀 10개를 관리할 때는 세마포어(초기값 10), 단일 임계 영역 보호에는 뮤텍스가 적합합니다.

### 🟢 "직접 구현했다" 어필 포인트

**Q9. OS 구현 중 가장 어려웠던 부분은?**

다음 중 본인이 실제로 고생했던 부분을 골라 답변 준비:

- **pipe 경쟁 조건**: `pageref(fd) == pageref(pipe)` 불변식이 close() 도중 일시적으로 깨지는 문제. `env_runs`로 스케줄러 전환을 감지해 재확인하는 방식으로 해결.
- **COW pgfault 핸들러**: TLB Mod 예외 발생 시 유저 공간 핸들러로 어떻게 제어를 넘기는지, 핸들러 스택을 별도로 유지해야 하는 이유.
- **TLB miss 처리**: MIPS에서 하드웨어가 아닌 소프트웨어가 TLB를 관리하므로 핸들러가 빨리 끝나야 함 (TLB 핸들러 안에서 또 TLB miss가 나면 무한 루프).

---

## MIPS 아키텍처 빠른 참조

### 주요 레지스터

| 레지스터 | 번호 | 역할 |
|---|---|---|
| `zero` | $0 | 항상 0 |
| `v0, v1` | $2, $3 | 함수 반환값, 시스템 콜 번호 |
| `a0~a3` | $4~$7 | 함수 인자 |
| `t0~t9` | $8~$15, $24~$25 | 임시 레지스터 (callee가 보존 안 해도 됨) |
| `s0~s7` | $16~$23 | 저장 레지스터 (callee가 보존해야 함) |
| `sp` | $29 | 스택 포인터 |
| `ra` | $31 | 반환 주소 (jal 명령이 자동으로 저장) |

### CP0 레지스터

| 레지스터 | 번호 | 역할 |
|---|---|---|
| `CP0_STATUS` | 12 | 인터럽트 마스크, 커널/유저 모드, EXL 비트 |
| `CP0_CAUSE` | 13 | 예외 원인 (ExcCode), 인터럽트 펜딩 |
| `CP0_EPC` | 14 | 예외 발생 시 PC (eret 시 여기로 복귀) |
| `CP0_BADVADDR` | 8 | 잘못된 메모리 접근 주소 |
| `CP0_ENTRYHI` | 10 | TLB 검색 키 (VPN2 + ASID) |
| `CP0_ENTRYLO0/1` | 2/3 | TLB 항목 (PPN + 속성) |
| `CP0_INDEX` | 0 | TLB 인덱스 |

### MIPS 예외 코드 (ExcCode)

| 코드 | 이름 | 발생 조건 |
|---|---|---|
| 0 | Int | 하드웨어 인터럽트 |
| 1 | Mod (TLB Mod) | 읽기 전용 페이지에 쓰기 → COW 트리거 |
| 2 | TLBL | TLB miss (읽기/실행) |
| 3 | TLBS | TLB miss (쓰기) |
| 8 | Sys | syscall 명령 실행 |
| 10 | RI | 정의되지 않은 명령 |
| 12 | Ov | 정수 오버플로우 |

### 중요 매크로/상수 (mmu.h)

```c
#define BY2PG       4096       // 페이지 크기 = 4KB
#define PGSHIFT     12         // 페이지 오프셋 비트 수
#define PDMAP       (4*1024*1024) // 페이지 디렉토리 커버 크기 = 4MB
#define KERNBASE    0x80000000 // 커널 공간 시작
#define ULIM        0x40000000 // 유저/커널 경계
#define UVPT        0x3ffff000 // 유저 가상 페이지 테이블
#define USTACKTOP   0x10000000 // 유저 스택 상단
#define TIMESTACK   0x7f400000 // 타이머 인터럽트 전용 스택
#define VPN(va)     ((va) >> PGSHIFT)  // 가상 주소 → 페이지 번호
#define PTE_V       0x0200     // PTE Valid 비트
#define PTE_R       0x0400     // PTE Read/Write 비트
#define PTE_COW     0x0001     // COW 플래그 (소프트웨어 정의)
#define PTE_LIBRARY 0x0002     // 공유 라이브러리 페이지
```

---

## 학습 우선순위 요약

```
★★★★★ (반드시)
  - 가상 메모리 변환 과정 (PDX→PTX→물리주소)
  - COW fork 동작 원리 (TLB Mod → pgfault)
  - 시스템 콜 흐름 (syscall 명령 → 커널 디스패치)
  - 컨텍스트 스위치 과정 (Trapframe 저장/복원)

★★★★ (중요)
  - TLB miss 처리 (MIPS 소프트웨어 처리 특징)
  - pipe EOF 감지 (pageref 경쟁 조건)
  - IPC 메커니즘 (send/recv 프로토콜)
  - 마이크로커널 vs 모놀리식 (파일 서버 구조)

★★★ (알면 좋음)
  - ELF 구조 (.text/.data/.bss)
  - 라운드로빈 스케줄러 한계
  - spawn() vs exec() 차이
  - 세마포어/뮤텍스/데드락
```

---

*정리 기준: BUAA-OS-2019 GitHub 레포 (`origin/lab0` ~ `origin/lab6` 브랜치) 실제 코드 분석*  
*아키텍처: MIPS R3000, GXemul 에뮬레이터*
