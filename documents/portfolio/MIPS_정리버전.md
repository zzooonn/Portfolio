# BUAA OS 2019 — MIPS 운영체제 완전 정리

> **용도**: 면접 기술 질문 대비 / 전체 개념 복습  
> **기반**: BUAA-OS-2019 실습 (lab0 ~ lab6), MIPS R3000 아키텍처  
> **구성**: 각 lab 핵심 개념 → 구현 포인트 → 면접 예상 질문 + 모범 답변
> **수정 내용**: Lab1~Lab6 설명을 구현 흐름, 핵심 함수, 헷갈리는 포인트 중심으로 보강

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

## lab1 — 커널 Boot, ELF, printf

### 1. Lab1의 목표

Lab1은 운영체제 실험의 출발점입니다. 아직 프로세스도 없고, 파일 시스템도 없고, 시스템 콜도 없습니다.  
핵심 목표는 다음입니다.

- 커널이 어디서 시작되는지 이해
- 링커 스크립트로 커널의 메모리 배치 이해
- MIPS 어셈블리에서 C 함수로 넘어가는 흐름 이해
- ELF 파일 구조 이해
- 커널 디버깅용 `printk` / `printfmt` 구현

---

### 2. 커널 시작점 `_start`

커널의 시작점은 보통 `kernel.lds` 같은 링커 스크립트에서 정합니다.

```ld
OUTPUT_ARCH(mips)
ENTRY(_start)

SECTIONS {
    . = 0x80010000;
    .text : { *(.text) }
    .data : { *(.data) }
    .bss  : { *(.bss) }

    bss_end = .;
    . = 0x80400000;
    end = .;
}
```

여기서 중요한 점은 두 가지입니다.

| 항목 | 의미 |
|---|---|
| `ENTRY(_start)` | 커널 실행 시작 함수는 `_start` |
| `. = 0x80010000` | 커널 코드가 배치될 시작 가상 주소 |

즉, 커널은 아무 주소에나 올라가는 것이 아니라, 링커 스크립트가 정한 주소 기준으로 배치됩니다.

---

### 3. `start.S`의 역할

`start.S`는 MIPS 어셈블리로 작성된 커널 최초 실행 코드입니다.

대표 흐름은 다음과 같습니다.

```asm
EXPORT(_start)
.set at
.set reorder

    mtc0    zero, CP0_STATUS     # 인터럽트 비활성화

    la      sp, KSTACKTOP        # 커널 스택 설정

    j       mips_init            # C 함수로 점프
```

#### 왜 스택을 먼저 설정할까?

C 함수는 지역 변수, 함수 호출, 반환 주소 저장 등을 위해 스택을 사용합니다.  
따라서 `mips_init()` 같은 C 함수를 호출하기 전에 반드시 `sp`를 유효한 커널 스택 주소로 설정해야 합니다.

#### 왜 `j mips_init`이고 `jal mips_init`이 아닐까?

`jal`은 함수 호출 후 돌아올 주소를 `ra`에 저장합니다.  
하지만 커널 초기화 함수인 `mips_init()`은 정상적으로 반환할 일이 없습니다.  
그래서 단순 점프인 `j`를 사용해도 됩니다.

---

### 4. MIPS 메모리 구역 이해

MIPS에는 대표적으로 다음 구역이 있습니다.

| 구역 | 주소 범위 | 특징 |
|---|---|---|
| `kuseg` | `0x00000000 ~ 0x7fffffff` | 유저 영역, TLB 사용 |
| `kseg0` | `0x80000000 ~ 0x9fffffff` | 커널 영역, 물리주소에 직접 매핑, 캐시 사용 |
| `kseg1` | `0xa0000000 ~ 0xbfffffff` | 커널 영역, 물리주소에 직접 매핑, 캐시 미사용 |
| `kseg2` | `0xc0000000 ~` | 커널 영역, TLB 사용 |

실험에서 자주 나오는 핵심은 다음입니다.

```c
KADDR(pa) = pa + ULIM
PADDR(kva) = kva - ULIM
```

즉, `kseg0` 커널 가상주소와 물리주소는 일정한 차이를 두고 직접 변환됩니다.

---

### 5. ELF 파일 구조

ELF는 실행 파일 형식입니다. 운영체제는 ELF를 읽고, “어떤 부분을 어느 주소에 올려야 하는지”를 판단합니다.

```text
ELF Header
  ├─ e_entry  : 실행 시작 주소
  ├─ e_phoff  : Program Header 시작 위치
  └─ e_phnum  : Program Header 개수

Program Header
  ├─ p_offset : 파일 안에서 세그먼트 위치
  ├─ p_vaddr  : 메모리에 올릴 가상 주소
  ├─ p_filesz : 파일에 존재하는 크기
  └─ p_memsz  : 메모리에 필요한 크기
```

#### `.bss`가 중요한 이유

`.bss`는 초기화되지 않은 전역 변수 영역입니다. 파일에는 실제 데이터가 없지만, 메모리에는 공간이 필요합니다.

```text
p_memsz > p_filesz 인 경우
남는 부분은 0으로 초기화해야 함
```

이 부분을 제대로 처리하지 않으면 전역 배열, 전역 변수 초기값이 깨질 수 있습니다.

---

### 6. `printk` / `vprintfmt`

커널에는 아직 일반적인 표준 입출력 라이브러리가 없습니다.  
그래서 디버깅 출력을 위해 직접 `printk`를 구현합니다.

전체 흐름은 보통 다음과 같습니다.

```text
printk(fmt, ...)
  ↓
vprintfmt(outputk, ...)
  ↓
outputk()
  ↓
printcharc()
  ↓
GXemul console device address에 문자 기록
```

핵심은 **문자 출력이 결국 특정 MMIO 주소에 값을 쓰는 것**이라는 점입니다.

---

### 7. Lab1에서 반드시 이해해야 할 질문

#### Q1. 커널 스택은 왜 필요한가요?

C 함수 호출을 위해 필요합니다. 함수 호출 과정에서 지역 변수, 인자, 반환 주소 등을 저장해야 하며, 이 저장 공간이 스택입니다. 커널도 함수 호출을 하기 때문에 커널 전용 스택이 필요합니다.

#### Q2. 링커 스크립트는 왜 필요한가요?

운영체제 커널은 일반 프로그램처럼 OS가 알아서 적절한 주소에 올려주는 것이 아닙니다. 커널 스스로 정해진 메모리 레이아웃을 따라야 하므로, 링커 스크립트로 `.text`, `.data`, `.bss`의 배치 주소를 명시합니다.

#### Q3. `kseg0`와 `kseg1`의 차이는 무엇인가요?

둘 다 물리 메모리에 직접 매핑되는 커널 주소 공간입니다. 차이는 캐시 사용 여부입니다. `kseg0`는 캐시를 사용하고, `kseg1`은 캐시를 사용하지 않습니다. 그래서 장치 MMIO 접근에는 보통 `kseg1`을 사용합니다.

---

## lab2 — 물리 메모리 관리, 2단계 페이지 테이블, TLB

### 1. Lab2의 목표

Lab2는 OS의 메모리 관리 기반을 만드는 단계입니다.

- 물리 메모리 크기 탐지
- 물리 페이지 관리 구조 `struct Page` 초기화
- free list 기반 페이지 할당/해제
- 2단계 페이지 테이블 구현
- 가상주소와 물리주소 매핑
- MIPS TLB refill 처리 이해

---

### 2. `mips_init()` 흐름 변화

Lab2에서 `mips_init()`은 다음 단계를 수행합니다.

```c
void mips_init() {
    printk("init.c:\tmips_init() is called\n");

    mips_detect_memory();
    mips_vm_init();
    page_init();

    while (1) {
    }
}
```

| 함수 | 역할 |
|---|---|
| `mips_detect_memory()` | 물리 메모리 크기 탐지 |
| `mips_vm_init()` | `pages` 배열 등 메모리 관리 구조 준비 |
| `page_init()` | 사용 가능한 물리 페이지를 free list에 넣음 |

---

### 3. 물리 메모리 탐지

```c
memsize = *(volatile u_int *)(KSEG1 | DEV_MP_ADDRESS | DEV_MP_MEMORY);
npage = memsize / BY2PG;
```

여기서 `DEV_MP_ADDRESS | DEV_MP_MEMORY`는 GXemul의 가상 장치 레지스터 주소입니다.  
이 주소를 `KSEG1`로 바꾸어 접근하는 이유는 장치 접근에 캐시가 끼면 안 되기 때문입니다.

```text
장치 레지스터 접근
  → 물리주소
  → KSEG1 가상주소로 변환
  → volatile 포인터로 읽기
```

`volatile`을 붙이는 이유는 컴파일러가 이 메모리 접근을 최적화로 제거하지 못하게 하기 위해서입니다.

---

### 4. `struct Page`

각 물리 페이지는 `struct Page` 하나로 관리됩니다.

```c
struct Page {
    LIST_ENTRY(Page) pp_link;
    u_short pp_ref;
};
```

| 필드 | 의미 |
|---|---|
| `pp_link` | free list 연결용 |
| `pp_ref` | 이 물리 페이지를 참조하는 PTE 개수 |

변환 관계는 다음과 같습니다.

```c
page2pa(pp) = (pp - pages) << PGSHIFT
pa2page(pa) = &pages[PPN(pa)]
page2kva(pp) = KADDR(page2pa(pp))
```

즉, `pages` 배열의 인덱스가 곧 물리 페이지 번호입니다.

---

### 5. `page_init()`

`page_init()`은 모든 물리 페이지 중 사용 가능한 페이지를 `page_free_list`에 넣습니다.

단, 아래 영역은 free list에 넣으면 안 됩니다.

- 커널 코드/데이터가 올라간 영역
- `pages` 배열이 차지하는 영역
- 이미 `alloc()`으로 사용한 초기 커널 메모리
- 물리 메모리 범위를 벗어난 영역

핵심은 다음입니다.

```text
사용 중인 페이지 → pp_ref 설정 또는 free list 제외
사용 가능한 페이지 → pp_ref = 0, page_free_list에 삽입
```

---

### 6. `page_alloc()` / `page_free()`

#### `page_alloc()`

```c
int page_alloc(struct Page **pp) {
    if (LIST_EMPTY(&page_free_list)) {
        return -E_NO_MEM;
    }

    *pp = LIST_FIRST(&page_free_list);
    LIST_REMOVE(*pp, pp_link);
    bzero(page2kva(*pp), BY2PG);
    return 0;
}
```

free list에서 하나 꺼내고, 페이지 내용을 0으로 초기화합니다.

#### `page_free()`

```c
void page_free(struct Page *pp) {
    if (pp->pp_ref != 0) {
        panic("page_free: pp_ref is nonzero");
    }
    LIST_INSERT_HEAD(&page_free_list, pp, pp_link);
}
```

참조 카운트가 0인 페이지에 대해서만 free list에 되돌릴 수 있습니다.

---

### 7. 2단계 페이지 테이블

32비트 가상주소는 다음처럼 나뉩니다.

```text
31          22 21          12 11          0
+-------------+--------------+-------------+
| PDX 10 bits | PTX 10 bits  | Offset 12   |
+-------------+--------------+-------------+
```

| 부분 | 역할 |
|---|---|
| `PDX` | 페이지 디렉토리 인덱스 |
| `PTX` | 페이지 테이블 인덱스 |
| `OFFSET` | 페이지 내부 오프셋 |

주소 변환 흐름은 다음입니다.

```text
va
 ↓
PDX(va)로 pgdir 엔트리 찾기
 ↓
페이지 테이블 주소 획득
 ↓
PTX(va)로 pte 찾기
 ↓
PTE_ADDR(pte) + offset
 ↓
pa
```

---

### 8. `pgdir_walk()`

`pgdir_walk()`는 특정 가상주소에 대응하는 PTE의 주소를 반환합니다.

```c
Pte *pgdir_walk(Pde *pgdir, u_long va, int create)
```

동작은 다음입니다.

```text
1. pgdir[PDX(va)] 확인
2. 페이지 테이블이 있으면 해당 PTE 반환
3. 없고 create == 1이면 새 페이지 테이블 할당
4. 없고 create == 0이면 NULL 반환
```

중요한 점은 이 함수가 “물리 페이지를 매핑”하는 함수가 아니라, **PTE를 찾거나 만들기 위한 함수**라는 점입니다.

---

### 9. `page_insert()` / `page_remove()`

#### `page_insert()`

```text
가상주소 va에 물리 페이지 pp를 매핑한다.
```

흐름은 다음입니다.

```text
1. pgdir_walk()로 PTE 찾기
2. 기존 매핑이 있으면 제거
3. 새 PTE에 page2pa(pp)와 권한 기록
4. pp_ref 증가
5. TLB invalidate
```

#### `page_remove()`

```text
가상주소 va의 매핑을 제거한다.
```

흐름은 다음입니다.

```text
1. PTE 찾기
2. 매핑된 page 찾기
3. pp_ref 감소
4. pp_ref가 0이면 page_free()
5. PTE를 0으로 초기화
6. TLB invalidate
```

---

### 10. TLB와 MIPS의 특징

TLB는 가상주소 → 물리주소 변환 결과를 저장하는 캐시입니다.

MIPS의 중요한 특징은 다음입니다.

> **TLB miss가 발생하면 하드웨어가 페이지 테이블을 자동 탐색하지 않고, 커널이 직접 처리합니다.**

흐름은 다음입니다.

```text
유저/커널 코드가 가상주소 접근
  ↓
TLB miss
  ↓
CPU가 예외 벡터로 이동
  ↓
커널 TLB refill handler 실행
  ↓
페이지 테이블에서 PTE 찾기
  ↓
TLB에 EntryHi / EntryLo 기록
  ↓
eret으로 원래 코드 복귀
```

---

### 11. Lab2에서 반드시 이해해야 할 질문

#### Q1. `pp_ref`는 왜 필요한가요?

하나의 물리 페이지가 여러 가상주소에 매핑될 수 있기 때문입니다. 예를 들어 fork 이후 COW 페이지나 공유 메모리에서는 여러 PTE가 같은 물리 페이지를 가리킬 수 있습니다. `pp_ref`가 0이 되었을 때만 실제로 free list에 반환해야 안전합니다.

#### Q2. `pgdir_walk()`와 `page_insert()`의 차이는 무엇인가요?

`pgdir_walk()`는 PTE의 위치를 찾거나 새 페이지 테이블을 만드는 함수입니다.  
`page_insert()`는 실제로 특정 가상주소와 물리 페이지를 연결하는 함수입니다.

#### Q3. MIPS TLB miss 처리가 x86과 다른 점은?

x86은 하드웨어가 정해진 페이지 테이블 구조를 따라 자동으로 페이지 테이블을 탐색합니다. 반면 MIPS는 TLB miss가 예외로 들어오고, OS가 직접 TLB를 채웁니다. 그래서 OS가 페이지 테이블 구조를 자유롭게 설계할 수 있지만, 구현 난이도는 더 높습니다.

---

## lab3 — 프로세스, 예외, 인터럽트, 스케줄링

### 1. Lab3의 목표

Lab3는 OS에 “실행 단위”를 추가하는 단계입니다.

- 프로세스 제어 블록 `struct Env` 관리
- 프로세스 주소 공간 생성
- ELF 프로그램을 유저 주소 공간에 로드
- 유저 모드로 전환
- 예외 처리 흐름 구현
- 타이머 인터럽트 기반 스케줄링 구현

---

### 2. `struct Env`

`Env`는 BUAA MOS에서 프로세스를 나타내는 구조체입니다. 일반적인 OS의 PCB에 해당합니다.

```c
struct Env {
    struct Trapframe env_tf;
    LIST_ENTRY(Env) env_link;
    u_int env_id;
    u_int env_asid;
    u_int env_parent_id;
    u_int env_status;
    Pde *env_pgdir;
    TAILQ_ENTRY(Env) env_sched_link;
    u_int env_pri;
    u_int env_runs;
};
```

| 필드 | 의미 |
|---|---|
| `env_tf` | 프로세스의 레지스터 상태 |
| `env_id` | 프로세스 식별자 |
| `env_asid` | TLB에서 주소 공간 구분 |
| `env_status` | FREE / RUNNABLE / NOT_RUNNABLE |
| `env_pgdir` | 해당 프로세스의 페이지 디렉토리 |
| `env_pri` | 스케줄링 우선순위 |
| `env_runs` | 실행 횟수, Lab6 pipe 경쟁 조건에서도 중요 |

---

### 3. `env_init()`

`env_init()`은 프로세스 관리 구조를 초기화합니다.

```text
1. env_free_list 초기화
2. env_sched_list 초기화
3. 모든 Env를 ENV_FREE로 설정
4. free list에 Env 삽입
5. base_pgdir 생성
6. UPAGES, UENVS를 사용자 주소 공간에 읽기 전용 매핑
```

`UPAGES`, `UENVS`를 유저 공간에 매핑하는 이유는 유저 프로그램도 `pages[]`, `envs[]`의 정보를 읽을 수 있게 하기 위해서입니다. 단, 보안상 수정은 불가능해야 하므로 읽기 전용으로 둡니다.

---

### 4. `env_alloc()`

`env_alloc()`은 새로운 프로세스 제어 블록을 할당합니다.

흐름은 다음입니다.

```text
1. env_free_list에서 Env 하나 꺼냄
2. env_setup_vm()으로 새 주소 공간 생성
3. env_id, env_parent_id 설정
4. env_status = ENV_RUNNABLE
5. Trapframe 초기화
6. 유저 스택 위치 설정
```

중요한 것은 프로세스가 단순히 `Env` 구조체 하나만 있다고 실행되는 것이 아니라, **자기만의 주소 공간과 초기 레지스터 상태**가 필요하다는 점입니다.

---

### 5. `env_setup_vm()`과 UVPT self-mapping

각 프로세스는 자기 페이지 디렉토리를 가집니다.

```c
e->env_pgdir = (Pde *)page2kva(p);
memcpy(e->env_pgdir + PDX(UTOP),
       base_pgdir + PDX(UTOP),
       sizeof(Pde) * (PDX(UVPT) - PDX(UTOP)));

e->env_pgdir[PDX(UVPT)] = PADDR(e->env_pgdir) | PTE_V;
```

여기서 핵심은 `UVPT`입니다.

`UVPT`는 페이지 디렉토리를 자기 자신에게 매핑하는 self-mapping 구조입니다.  
이렇게 하면 유저 프로그램이 자기 페이지 테이블 정보를 읽을 수 있습니다.

```text
UVPT 영역 접근
  ↓
페이지 디렉토리 자기 자신을 거침
  ↓
현재 주소 공간의 PTE/PDE 정보를 읽을 수 있음
```

이 기능은 Lab4의 `fork`, COW 구현에서 매우 중요합니다. 유저 레벨 `fork()`가 현재 프로세스의 어떤 페이지가 매핑되어 있는지 알아야 하기 때문입니다.

---

### 6. `load_icode()`

`load_icode()`는 ELF 형식의 유저 프로그램을 프로세스 주소 공간에 적재합니다.

흐름은 다음입니다.

```text
1. ELF Header 확인
2. Program Header 순회
3. 로드 대상 세그먼트마다
   - va 영역에 페이지 할당
   - 파일 내용 복사
   - p_memsz > p_filesz 부분은 0 초기화
4. env_tf.cp0_epc = ELF entry
```

여기서 `cp0_epc`를 ELF entry로 설정하는 이유는, 나중에 `eret`으로 유저 모드에 복귀했을 때 해당 주소부터 실행하게 만들기 위해서입니다.

---

### 7. `env_run()`

`env_run()`은 특정 프로세스를 실제로 실행합니다.

```text
1. curenv 갱신
2. 해당 프로세스 상태를 RUNNABLE로 설정
3. 주소 공간 전환
4. TLB 관련 정보 갱신
5. env_pop_tf()로 Trapframe 복원
6. eret으로 유저 모드 진입
```

핵심은 프로세스 전환이 단순히 C 함수 호출이 아니라는 점입니다.  
CPU 레지스터, PC, status, 주소 공간이 함께 바뀌어야 합니다.

---

### 8. 예외 처리 흐름

MIPS에서 예외가 발생하면 CPU는 정해진 예외 벡터 주소로 이동합니다.

```text
예외 발생
  ↓
CPU가 EPC, Cause, Status 등 CP0 레지스터 설정
  ↓
예외 벡터로 점프
  ↓
SAVE_ALL로 레지스터 저장
  ↓
Cause.ExcCode 확인
  ↓
해당 핸들러 호출
  ↓
RESTORE_ALL
  ↓
eret
```

대표 예외는 다음입니다.

| 예외 | 의미 |
|---|---|
| TLB miss | 주소 변환 실패 |
| TLB Mod | 쓰기 권한 없는 페이지에 쓰기 |
| Syscall | 유저가 `syscall` 명령 실행 |
| Interrupt | 타이머 등 외부 인터럽트 |

---

### 9. 타이머 인터럽트와 스케줄링

Lab3에서는 시계 장치를 설정하고, 주기적으로 인터럽트를 발생시켜 커널이 CPU 제어권을 다시 얻도록 합니다.

```text
유저 프로세스 실행 중
  ↓
타이머 인터럽트 발생
  ↓
커널 예외 핸들러 진입
  ↓
schedule()
  ↓
다음 RUNNABLE 프로세스 선택
  ↓
env_run(next)
```

이 구조 덕분에 유저 프로세스가 무한 루프를 돌더라도 커널이 다시 제어권을 얻을 수 있습니다.

---

### 10. Lab3에서 반드시 이해해야 할 질문

#### Q1. 프로세스와 프로그램의 차이는 무엇인가요?

프로그램은 디스크나 메모리에 존재하는 정적인 코드와 데이터입니다. 프로세스는 그 프로그램이 실행 중인 상태이며, 주소 공간, 레지스터 상태, 스택, PCB 등을 포함합니다.

#### Q2. Trapframe은 왜 필요한가요?

예외나 인터럽트가 발생하면 실행 중이던 프로세스의 레지스터 상태를 잃어버리면 안 됩니다. Trapframe은 그 순간의 레지스터, EPC, Cause, Status 등을 저장해 두었다가 나중에 복원하기 위한 구조체입니다.

#### Q3. 타이머 인터럽트가 없으면 어떤 문제가 생기나요?

프로세스가 CPU를 자발적으로 양보하지 않으면 커널이 다시 CPU 제어권을 얻기 어렵습니다. 타이머 인터럽트는 강제로 커널에 진입하게 만들어 선점형 스케줄링의 기반이 됩니다.

---

## lab4 — 시스템 콜, IPC, fork, COW

### 1. Lab4의 목표

Lab4는 유저 프로그램이 커널 기능을 안전하게 사용할 수 있게 만드는 단계입니다.

- 시스템 콜 진입/분배 구현
- 기본 메모리 관련 시스템 콜 구현
- IPC 구현
- `fork()` 구현
- Copy-On-Write 구현
- 유저 레벨 page fault handler 구현

---

### 2. 시스템 콜의 본질

시스템 콜은 “유저 함수가 커널 함수를 직접 호출하는 것”이 아닙니다.

정확한 흐름은 다음입니다.

```text
유저 코드
  ↓
syscall_* wrapper
  ↓
msyscall()
  ↓
MIPS syscall 명령
  ↓
Syscall 예외 발생
  ↓
커널 예외 핸들러
  ↓
do_syscall()
  ↓
syscall_table[sysno] 호출
  ↓
Trapframe의 v0에 반환값 저장
  ↓
eret으로 유저 모드 복귀
```

즉, 시스템 콜은 **예외를 이용한 커널 진입 메커니즘**입니다.

---

### 3. `do_syscall()`

`do_syscall()`은 시스템 콜 번호를 보고 실제 커널 함수를 호출합니다.

```c
void do_syscall(struct Trapframe *tf) {
    int sysno = tf->regs[4];   // a0

    tf->cp0_epc += 4;          // syscall 명령 다음으로 복귀

    func = syscall_table[sysno];

    arg1 = tf->regs[5];        // a1
    arg2 = tf->regs[6];        // a2
    arg3 = tf->regs[7];        // a3
    arg4 = *(u_int *)(tf->regs[29] + 16);
    arg5 = *(u_int *)(tf->regs[29] + 20);

    tf->regs[2] = func(arg1, arg2, arg3, arg4, arg5); // v0
}
```

핵심은 세 가지입니다.

1. `a0`에 시스템 콜 번호가 들어있습니다.
2. 반환값은 `v0`에 저장합니다.
3. `EPC += 4`를 하지 않으면 같은 `syscall` 명령을 계속 반복합니다.

---

### 4. 기본 시스템 콜

Lab4에서 중요한 기본 시스템 콜은 다음입니다.

| 시스템 콜 | 역할 |
|---|---|
| `sys_mem_alloc` | 특정 프로세스의 가상주소에 물리 페이지 할당 |
| `sys_mem_map` | 한 프로세스의 페이지를 다른 프로세스에 매핑 |
| `sys_mem_unmap` | 가상주소 매핑 해제 |
| `sys_yield` | CPU 양보 |
| `sys_env_destroy` | 프로세스 제거 |
| `sys_exofork` | 새 프로세스 생성 |
| `sys_set_env_status` | 프로세스 상태 변경 |
| `sys_set_trapframe` | 프로세스의 초기 실행 상태 설정 |
| `sys_ipc_try_send` | IPC 송신 |
| `sys_ipc_recv` | IPC 수신 |

이 시스템 콜들이 있어야 유저 레벨에서 `fork`, `ipc`, `pipe`, `spawn` 같은 기능을 만들 수 있습니다.

---

### 5. IPC

IPC는 프로세스 간 통신입니다. MOS에서는 메시지 값과 선택적인 페이지 공유를 함께 지원합니다.

#### 수신자 `sys_ipc_recv`

```text
1. 현재 프로세스 env_ipc_recving = 1
2. 받을 페이지 주소 env_ipc_dstva 저장
3. 현재 프로세스를 ENV_NOT_RUNNABLE로 변경
4. schedule() 호출
```

#### 송신자 `sys_ipc_try_send`

```text
1. 대상 프로세스가 수신 대기 중인지 확인
2. value 전달
3. srcva가 유효하면 페이지 매핑 공유
4. 대상 프로세스 IPC 필드 설정
5. 대상 프로세스를 ENV_RUNNABLE로 변경
```

중요한 점은 수신자가 먼저 대기해야 한다는 것입니다.  
수신자가 준비되지 않았으면 송신은 실패하고, 유저 라이브러리에서 재시도합니다.

---

### 6. `fork()`와 COW

일반적인 `fork()`는 부모 프로세스의 주소 공간을 자식에게 복사합니다.  
하지만 모든 페이지를 즉시 복사하면 비효율적입니다.

그래서 Lab4에서는 Copy-On-Write를 사용합니다.

```text
fork()
  ↓
sys_exofork()로 자식 Env 생성
  ↓
부모의 매핑된 페이지를 순회
  ↓
쓰기 가능한 페이지는 부모/자식 모두 PTE_COW로 변경
  ↓
읽기 전용 페이지는 그대로 공유
  ↓
자식 상태를 RUNNABLE로 변경
```

#### COW 동작

```text
부모와 자식이 같은 물리 페이지 공유
  ↓
둘 다 쓰기 권한 없음 + PTE_COW
  ↓
둘 중 하나가 쓰기 시도
  ↓
TLB Mod 예외 발생
  ↓
유저 pgfault handler 실행
  ↓
새 페이지 할당
  ↓
기존 내용 복사
  ↓
새 페이지를 쓰기 가능하게 매핑
```

---

### 7. 유저 레벨 page fault handler

COW 처리는 커널이 전부 직접 하지 않습니다.  
커널은 예외 발생 시 유저가 등록한 핸들러로 제어를 넘길 수 있게 합니다.

필요한 요소는 다음입니다.

| 요소 | 역할 |
|---|---|
| `sys_set_tlb_mod_entry` | 유저 TLB Mod handler 주소 등록 |
| exception stack (UXSTACK) | 유저 예외 처리 전용 스택 |
| `cow_entry()` | COW 복사 수행 (유저 핸들러) |
| `fork()` | fork 시 핸들러를 `cow_entry`로 등록 |

#### 7-1. 커널 → 유저 핸들러로 제어를 넘기는 흐름

TLB Mod 예외가 나면 커널의 `do_tlb_mod`(`kern/tlbex.c:65`)가 현재 컨텍스트를 **UXSTACK에 복사**하고 EPC를 유저 핸들러로 바꿉니다.

```c
// kern/tlbex.c:65
void do_tlb_mod(struct Trapframe *tf) {
    struct Trapframe tmp_tf = *tf;

    // 현재 sp가 UXSTACK 범위 밖이면 UXSTACKTOP으로 전환
    if (tf->regs[29] < USTACKTOP || tf->regs[29] >= UXSTACKTOP) {
        tf->regs[29] = UXSTACKTOP;
    }
    tf->regs[29] -= sizeof(struct Trapframe);
    *(struct Trapframe *)tf->regs[29] = tmp_tf;   // 컨텍스트를 UXSTACK에 저장

    if (curenv->env_user_tlb_mod_entry) {
        tf->regs[4] = tf->regs[29];               // a0 = 저장한 tf 포인터
        tf->regs[29] -= sizeof(tf->regs[4]);
        tf->cp0_epc = curenv->env_user_tlb_mod_entry;  // 복귀 지점을 유저 핸들러로
    } else {
        panic("TLB Mod but no user handler registered");
    }
}
```

유저 핸들러 `cow_entry`(`user/lib/fork.c:16`)는 새 페이지를 할당·복사한 뒤 원래 명령으로 되돌아갑니다.

```c
// user/lib/fork.c:16
static void __attribute__((noreturn)) cow_entry(struct Trapframe *tf) {
    u_int va = tf->cp0_badvaddr;
    u_int perm = vpt[VPN(va)] & 0xfff;
    if (!(perm & PTE_COW)) user_panic("perm without PTE_COW");

    perm = (perm & ~PTE_COW) | PTE_D;             // COW 제거, 쓰기 가능 부여
    syscall_mem_alloc(0, (void *)UCOW, perm);     // 임시 주소 UCOW에 새 페이지
    memcpy((void *)UCOW, (void *)ROUNDDOWN(va, BY2PG), BY2PG);  // 내용 복사
    syscall_mem_map(0, (void *)UCOW, 0, (void *)va, perm);      // va에 재매핑
    syscall_mem_unmap(0, (void *)UCOW);

    int r = syscall_set_trapframe(0, tf);         // 원래 명령으로 복귀
    user_panic("syscall_set_trapframe returned %d", r);
}
```

#### 7-2. 왜 별도 스택(UXSTACK)이 필요한가 — COW 무한 페이지 폴트 (⭐ 심화)

여기서 악명 높은 함정이 나옵니다. **page fault 핸들러가 하는 일 자체가 '메모리에 쓰는 것'** 이라는 점입니다. 새 페이지에 내용을 복사하는 것도 쓰기고, 핸들러가 지역 변수를 스택에 쌓는 것도 쓰기입니다.

만약 이 핸들러를 **일반 유저 스택** 위에서 돌리면 재앙이 벌어집니다. fork 직후에는 스택 페이지 자체도 COW로 공유되기 때문입니다.

```text
① 프로그램이 스택에 씀 → 스택이 COW라 읽기 전용 → TLB Mod 예외!
② 핸들러 진입 → 핸들러도 지역 변수를 (같은) 스택에 쌓아야 함 → 또 스택에 씀
③ 그 스택이 아직 COW → 또 TLB Mod 예외!
④ 다시 핸들러 진입 → 또 스택에 씀 → 또 예외 → ... 무한 반복
```

즉 **"페이지 폴트를 처리하려는 행위 자체가 또 페이지 폴트를 일으키는" 재귀 구조**입니다. 소방관이 불을 끄러 들어갔는데 들어가는 것 자체가 새 불을 내는 셈이죠.

**해결책**: 유저 page fault 핸들러는 일반 유저 스택이 아니라 **예외 전용 독립 스택(UXSTACK)** 위에서 돌게 만듭니다. 위 `do_tlb_mod`가 sp를 `UXSTACKTOP`으로 전환하는 부분(`tf->regs[29] = UXSTACKTOP`)이 바로 그 장치입니다.

```text
일반 실행    → 일반 유저 스택 (USTACKTOP 아래)
예외 발생 시 → 커널이 sp를 UXSTACK으로 전환 후 핸들러 실행
```

메모리 레이아웃(`include/mmu.h`)에서도 두 스택이 분리되어 있습니다.

```c
#define UTOP UENVS
#define UXSTACKTOP UTOP                 // user exception stack (0x7f400000)
#define USTACKTOP (UTOP - 2 * BY2PG)    // normal user stack   (0x7f3fe000)
#define UCOW  (UTEXT - BY2PG)           // COW 복사용 임시 주소 (0x003ff000)
```

UXSTACK은 COW로 공유되지 않는, 각 프로세스가 처음부터 독립적으로 쓰기 가능하게 확보한 페이지라 핸들러가 여기에 지역 변수를 쌓아도 TLB Mod가 안 납니다. **폴트를 처리하는 공간이 폴트로부터 안전해지는 것**입니다.

> 💡 한 문장 원칙: **"페이지 폴트를 처리하는 코드는, 그 자신이 페이지 폴트를 일으키지 않는 안전지대(UXSTACK)에서 실행돼야 한다."**

#### 7-3. TLB miss 무한 루프와의 닮은꼴

이 구조는 `Q9`의 "TLB 핸들러 안에서 또 TLB miss가 나면 무한 루프"와 **같은 계열**입니다 — 예외를 처리하는 도중 같은 예외를 또 유발하는 자기참조. 방어 기법만 다릅니다.

| 사례 | 문제 | 방어 |
|---|---|---|
| TLB miss 재귀 | refill 핸들러가 접근하는 데이터가 또 TLB miss | 핸들러를 짧게, 접근 데이터는 항상 매핑 유지 |
| COW 무한 폴트 | 폴트 처리(쓰기)가 또 폴트를 유발 | 별도 안전 스택(UXSTACK)에서 실행 |

문제의 본질은 둘 다 "예외 처리의 자기참조"로 동일합니다.

---

### 8. Lab4에서 반드시 이해해야 할 질문

#### Q1. 시스템 콜은 왜 필요한가요?

유저 프로그램이 커널 메모리나 장치에 직접 접근하면 시스템 안정성이 깨질 수 있습니다. 따라서 커널은 제한된 진입점인 시스템 콜만 제공하고, 유저 프로그램은 예외를 통해 커널 모드로 들어가 필요한 서비스를 요청합니다.

#### Q2. `EPC += 4`는 왜 필요한가요?

`EPC`는 예외가 발생한 명령어 주소를 저장합니다. 시스템 콜 처리 후 `EPC`를 그대로 두면, 복귀하자마자 같은 `syscall` 명령을 다시 실행하여 무한 반복됩니다. 그래서 다음 명령어로 넘어가도록 4를 더합니다.

#### Q3. COW의 장점은 무엇인가요?

fork 시 모든 메모리를 즉시 복사하지 않고, 실제 쓰기가 발생한 페이지에 대해서만 복사합니다. 따라서 fork 비용을 크게 줄이고 메모리 사용량도 절약할 수 있습니다.

---

## lab5 — 파일 시스템 서버

### 1. Lab5의 목표

Lab5는 파일 시스템을 구현하는 단계입니다.

- 디스크 이미지 구조 이해
- IDE 장치 읽기/쓰기
- 블록 캐시 구현
- 파일 메타데이터 구조 구현
- 유저 공간 파일 시스템 서버 구현
- IPC 기반 파일 요청 처리
- `open`, `read`, `write`, `close` 등의 파일 API 구현

---

### 2. 파일 시스템 구조

디스크는 블록 단위로 관리됩니다.

```text
Block 0      Boot block
Block 1      Super block
Block 2~     Bitmap blocks
그 이후      Data / File / Index blocks
```

| 블록 | 역할 |
|---|---|
| Boot block | 부트 관련 영역 |
| Super block | 파일 시스템 전체 정보 |
| Bitmap block | 각 블록 사용 여부 |
| File block | 디렉토리 엔트리 또는 파일 메타데이터 |
| Data block | 실제 파일 내용 |
| Index block | indirect block 번호 저장 |

---

### 3. `struct Super`

```c
struct Super {
    uint32_t s_magic;
    uint32_t s_nblocks;
    struct File s_root;
};
```

| 필드 | 의미 |
|---|---|
| `s_magic` | 파일 시스템 식별용 magic number |
| `s_nblocks` | 전체 블록 수 |
| `s_root` | 루트 디렉토리 파일 구조 |

---

### 4. `struct File`

```c
struct File {
    char f_name[MAXNAMELEN];
    uint32_t f_size;
    uint32_t f_type;
    uint32_t f_direct[NDIRECT];
    uint32_t f_indirect;
    struct File *f_dir;
};
```

| 필드 | 의미 |
|---|---|
| `f_name` | 파일 이름 |
| `f_size` | 파일 크기 |
| `f_type` | 일반 파일 / 디렉토리 |
| `f_direct` | 직접 블록 번호 배열 |
| `f_indirect` | 간접 블록 번호 |
| `f_dir` | 메모리에서 부모 디렉토리 포인터 |

#### direct / indirect 구조

```text
작은 파일
  → f_direct[]만 사용

큰 파일
  → f_direct[] 사용 후
  → f_indirect가 가리키는 index block 사용
```

이 구조는 Unix inode의 direct/indirect pointer와 비슷합니다.

---

### 5. Bitmap

파일 시스템은 bitmap으로 블록 사용 여부를 관리합니다.

```text
bit = 1  → free block
bit = 0  → used block
```

블록을 할당할 때는 bitmap에서 1인 위치를 찾고, 사용 중으로 0을 설정합니다.

---

### 6. 블록 캐시

디스크 접근은 느리기 때문에, 파일 시스템 서버는 디스크 블록을 메모리 주소 공간에 캐싱합니다.

```text
disk block n
  ↓
DISKMAP + n * BY2BLK
```

처음 접근할 때는 page fault가 발생하고, fault handler가 실제 디스크에서 해당 블록을 읽어 메모리에 올립니다.  
이후 같은 블록을 다시 접근하면 메모리에서 바로 읽을 수 있습니다.

---

### 7. 파일 시스템을 유저 공간 서버로 구현하는 이유

MOS는 파일 시스템을 커널 내부가 아니라 유저 프로세스 `fs_serv`로 구현합니다.

장점:

- 커널이 작아짐
- 파일 시스템 버그가 커널 전체를 망가뜨릴 가능성이 줄어듦
- IPC 기반으로 구조가 명확해짐

단점:

- 파일 요청마다 IPC 비용이 듦
- 모놀리식 커널보다 I/O 경로가 길어짐

---

### 8. 파일 요청 흐름

예를 들어 유저가 `open("/motd", O_RDONLY)`를 호출하면 다음 흐름으로 진행됩니다.

```text
user program
  ↓
open()
  ↓
fsipc_open()
  ↓
ipc_send(fs_serv, FSREQ_OPEN, ...)
  ↓
fs_serv의 serve()
  ↓
serve_open()
  ↓
file_open()
  ↓
파일 메타데이터 페이지를 유저에게 공유
```

`read()`도 비슷합니다.

```text
read(fd, buf, n)
  ↓
fd_lookup()
  ↓
devfile.dev_read()
  ↓
fsipc_read()
  ↓
FSREQ_READ IPC
  ↓
fs_serv
  ↓
file_read()
  ↓
결과 반환
```

---

### 9. 파일 디스크립터 구조

유저 프로그램은 파일을 직접 조작하지 않고 `Fd`를 통해 접근합니다.

```c
struct Fd {
    u_int fd_dev_id;
    u_int fd_offset;
    u_int fd_omode;
};
```

| 필드 | 의미 |
|---|---|
| `fd_dev_id` | 어떤 장치인지: file, pipe, console |
| `fd_offset` | 현재 파일 읽기/쓰기 위치 |
| `fd_omode` | open mode |

`fd_dev_id`에 따라 실제 처리 함수가 달라집니다.

```text
devfile → 파일 서버 IPC
devpipe → 공유 메모리 pipe
devcons → console syscall
```

---

### 10. Lab5에서 반드시 이해해야 할 질문

#### Q1. 왜 파일 시스템을 커널이 아니라 유저 서버로 구현했나요?

마이크로커널적인 구조를 경험하기 위해서입니다. 파일 시스템을 유저 프로세스로 두면 커널은 IPC와 메모리 관리 같은 핵심 기능만 담당하고, 파일 시스템 로직은 독립된 서버가 담당합니다.

#### Q2. direct block과 indirect block은 왜 나누나요?

작은 파일은 direct block만으로 빠르게 접근할 수 있습니다. 큰 파일은 direct block만으로 부족하므로, indirect block을 통해 더 많은 데이터 블록 번호를 저장합니다.

#### Q3. block cache는 왜 필요한가요?

디스크 I/O는 메모리 접근보다 훨씬 느립니다. 자주 접근하는 블록을 메모리에 매핑해 두면 반복 접근 시 성능을 높일 수 있습니다.

---

## lab6 — Shell, Spawn, Pipe

### 1. Lab6의 목표

Lab6는 사용자가 실제로 OS를 사용할 수 있게 만드는 단계입니다.

- `user_icode`로 초기 유저 프로세스 실행
- `init.b` 실행
- 콘솔 표준 입출력 설정
- `spawn()` 구현
- pipe 구현
- shell 명령 파싱
- 리다이렉션, 파이프라인 실행

---

### 2. 최종 `mips_init()` 흐름

Lab6까지 완성된 OS의 초기화 흐름은 다음과 같습니다.

```c
void mips_init() {
    mips_detect_memory();
    mips_vm_init();
    page_init();

    env_init();

    ENV_CREATE(user_icode);  // 첫 번째 유저 프로세스
    ENV_CREATE(fs_serv);     // 파일 시스템 서버

    kclock_init();
    enable_irq();

    while (1) {
    }
}
```

여기서 중요합니다.

| 프로세스 | 역할 |
|---|---|
| `user_icode` | 최초 유저 프로세스, init/sh 실행 |
| `fs_serv` | 파일 시스템 서버 |

---

### 3. Shell 시작 흐름

전체 시작 흐름은 다음입니다.

```text
커널 mips_init()
  ↓
ENV_CREATE(user_icode)
  ↓
user/icode.c 실행
  ↓
/motd 출력
  ↓
spawnl("init.b")
  ↓
user/init.c 실행
  ↓
opencons()로 fd 0 생성
  ↓
dup(0, 1)로 stdout 생성
  ↓
반복적으로 spawnl("sh.b")
  ↓
Shell 실행
```

즉, shell은 커널이 직접 실행하는 것이 아니라, 유저 초기화 프로세스가 spawn으로 실행합니다.

---

### 4. `spawn()`의 역할

MOS에는 Unix의 `exec()` 시스템 콜이 없습니다.  
대신 `spawn()`이 파일 시스템에서 ELF 파일을 읽어 새 프로세스를 만듭니다.

```text
spawn(path, argv)
  ↓
open(path)
  ↓
ELF header 읽기
  ↓
sys_exofork()로 자식 생성
  ↓
각 ELF segment를 자식 주소 공간에 매핑
  ↓
argv를 자식 스택에 구성
  ↓
자식 Trapframe 설정
  ↓
자식 ENV_RUNNABLE
```

`fork()`와의 차이는 다음입니다.

| 함수 | 의미 |
|---|---|
| `fork()` | 현재 프로세스를 복제 |
| `spawn()` | 파일에서 프로그램을 읽어 새 프로세스 생성 |
| `exec()` | 현재 프로세스 주소 공간을 새 프로그램으로 교체 |

MOS에는 `exec()`이 없으므로, `spawn()`으로 새 프로그램 실행을 처리합니다.

---

### 5. 파일 디스크립터 상속과 `dup`

Shell에서 표준 입출력이 중요한 이유는 자식 프로세스가 같은 입력/출력 대상을 사용해야 하기 때문입니다.

```text
fd 0 → stdin
fd 1 → stdout
```

`dup(0, 1)`은 fd 0의 파일 디스크립터 페이지와 데이터 페이지를 fd 1에 공유 매핑합니다.

즉, stdin과 stdout은 단순한 숫자가 아니라, 유저 주소 공간에 매핑된 `Fd` 구조와 관련 데이터 페이지로 관리됩니다.

---

### 6. Pipe 구현

pipe는 프로세스 사이에서 데이터를 주고받는 통로입니다.

MOS의 pipe는 커널 버퍼가 아니라 유저 공간 공유 페이지로 구현됩니다.

```c
struct Pipe {
    u_int p_rpos;
    u_int p_wpos;
    u_char p_buf[BY2PIPE];
};
```

| 필드 | 의미 |
|---|---|
| `p_rpos` | 읽기 위치 |
| `p_wpos` | 쓰기 위치 |
| `p_buf` | 순환 버퍼 |

pipe 생성 시 보통 두 개의 fd가 만들어집니다.

```text
fd[0] → read end
fd[1] → write end
```

두 fd는 같은 pipe data page를 공유합니다.

---

### 7. pipe read/write

#### write

```text
버퍼가 가득 차면 기다림
공간이 있으면 p_buf[p_wpos % BY2PIPE]에 기록
p_wpos 증가
```

#### read

```text
버퍼가 비어 있으면 기다림
데이터가 있으면 p_buf[p_rpos % BY2PIPE]에서 읽음
p_rpos 증가
```

기다릴 때는 busy waiting 형태로 `syscall_yield()`를 호출합니다.

---

### 8. pipe EOF와 `pageref` — 경쟁 조건 상세 (⭐ 심화)

pipe에서 가장 헷갈리는 부분은 닫힘 감지(EOF)입니다.

```text
읽는 쪽은 “쓰는 쪽이 모두 닫혔는지” 알아야 함  → 닫혔으면 EOF, 아니면 대기
쓰는 쪽은 “읽는 쪽이 모두 닫혔는지” 알아야 함  → 닫혔으면 쓰기 중단
```

#### 8-1. 근본 전제: fd 하나 = 물리 페이지 두 장

이 문제의 뿌리는 **파이프 fd 하나가 물리 페이지 두 장을 붙들고 있다**는 데 있습니다.

```text
pipe fd 하나
 ├─ Fd 구조체 페이지        → pageref(fd)   로 셈  (이 fd를 연 env 수)
 └─ Pipe 데이터 페이지(버퍼) → pageref(p)    로 셈  (전체 reader + writer 수)
```

`pipe()`가 fd 두 개(`fd[0]`=read, `fd[1]`=write)를 만들 때, 데이터 페이지는 두 fd가 **공유**하고 Fd 페이지는 각 fd가 **따로** 가집니다. (`user/lib/pipe.c:36` `pipe()` — Step 1에서 각 Fd 페이지 alloc, Step 2에서 데이터 페이지를 `syscall_mem_map`으로 공유)

핵심 불변식은 다음입니다.

```text
정상 상태:  pageref(fd) < pageref(pipe)
```

writer(`fd[1]`)는 pipe 데이터 페이지에는 참조를 보태지만 reader의 Fd 페이지(`fd[0]`)에는 안 보태기 때문에, **반대편이 살아있는 한 pipe 쪽이 항상 더 큽니다.** 그러다 반대편이 전부 닫히면 그 차이가 사라져 `==`가 되고, 그때 비로소 EOF입니다. 그래서 판정식이 `_pipe_is_closed`(`user/lib/pipe.c:95`)에서 이렇게 됩니다.

```c
// user/lib/pipe.c:95
static int _pipe_is_closed(struct Fd *fd, struct Pipe *p) {
    // pageref(p)  = 전체 reader + writer 수
    // pageref(fd) = 이 fd를 연 env 수 (reader면 reader 수, writer면 writer 수)
    // 두 값이 같아지면 반대편이 다 닫힌 것 → 닫힘
    int fd_ref, pipe_ref, runs;
    do {
        runs = env->env_runs;
        fd_ref = pageref((void *)fd);
        pipe_ref = pageref((void *)p);
    } while (runs != env->env_runs);
    return fd_ref == pipe_ref;
}
```

> ⚠️ 헷갈림 주의: 이건 **TLB miss로 인한 오판이 아닙니다.** 문제의 정체는 아직 writer가 살아있는데도 순간적으로 `pageref(fd) == pageref(pipe)`가 성립해 **거짓 EOF(false EOF)** 로 오판하는 것입니다.

#### 8-2. 왜 오판이 나는가 — dup/close의 비원자성

fd 하나를 없애거나(close) 복제하려면(dup) **두 페이지를 각각 건드려야** 하고, 그건 곧 `syscall_mem_unmap`/`syscall_mem_map`을 **두 번** 호출한다는 뜻입니다. 이 두 호출은 원자적이지 않아서, 그 "사이"에 clock interrupt(스케줄 전환)가 끼면 참조 수가 어중간한 중간 상태가 됩니다.

이 상황을 일부러 재현하는 테스트가 `user/testpiperace.c`입니다. 원문 주석이 숫자로 정확히 짚어줍니다.

```c
// user/testpiperace.c:20
// Now the ref count for p[0] will toggle between 2 and 3
// as the parent dups and closes it (there's a close implicit in dup).
//
// The ref count for p[1] is 1.
// Thus the ref count for the underlying pipe structure
// will toggle between 3 and 4.
//
// If a clock interrupt catches close between unmapping
// the pipe structure and unmapping the fd, we'll have
// a ref count for p[0] of 3, a ref count for p[1] of 1,
// and a ref count for the pipe structure of 3, which is
// a no-no.
//
// If a clock interrupt catches dup between mapping the
// fd and mapping the pipe structure, we'll have the same
// ref counts, still a no-no.
```

여기서 힌트는 `there's a close implicit in dup` — `dup(old, new)`는 새 fd에 매핑하기 전에 `new`를 먼저 close합니다(`user/lib/fd.c:126` `close(newfdnum)`). 그래서 참조 수가 진동합니다.

```text
p[0] (read fd)      : 2 ↔ 3 토글
p[1] (write fd)     : 1 고정
Pipe 데이터 페이지  : 3 ↔ 4 토글
```

**① close가 잘못된 순서일 때 (pipe 먼저 unmap → fd 나중):**

```text
시작:  p[0]=3, p[1]=1, pipe=4
  ① pipe 데이터 페이지 unmap → pipe = 3   ← p[0]=3, pipe=3 → 3 == 3  거짓 닫힘!
  ② fd unmap                → p[0] = 2
```

writer(p[1])가 멀쩡히 살아있는데 중간 상태에서 `p[0] == pipe`가 되어 EOF로 착각합니다. (주석의 "which is a no-no")

**② dup이 잘못된 순서일 때 (fd 먼저 map → pipe 나중):**

```text
시작:  p[0]=2, pipe=3
  ① fd map   → p[0] = 3   ← p[0]=3, pipe=3 → 3 == 3  거짓 닫힘! (같은 no-no)
  ② pipe map → pipe = 4
```

#### 8-3. 해결: 순서 재배치로 "안전한 방향으로만" 불변식을 깬다

핵심 규칙: **fd 참조 수를 항상 안전한 쪽(pipe보다 낮은 쪽)에 둔다 → 줄일 땐(close) fd를 먼저 내리고, 늘릴 땐(dup) pipe를 먼저 올린다.**

`pipe_close`(`user/lib/pipe.c:247`) — fd 먼저 unmap, 데이터 나중:

```c
// user/lib/pipe.c:247
static int pipe_close(struct Fd *fd) {
    // 주석 처리된 두 줄이 '잘못된 순서' 후보 (no-no를 만들던 코드)
    // syscall_mem_unmap(0, (void *)fd2data(fd));
    // syscall_mem_unmap(0, fd);
    syscall_mem_unmap(0, fd);                     // ① fd 먼저: p[0]=3 → 2
    syscall_mem_unmap(0, (void *)fd2data(fd));    // ② pipe 나중
    return 0;
}
```

→ 중간 상태가 `p[0]=2, pipe=4`라 `2 < 4`, 절대 `==`가 안 됩니다.

`dup`(`user/lib/fd.c:116`) — 데이터 페이지 먼저 map, Fd 페이지 나중:

```c
// user/lib/fd.c:130 — FD를 먼저 map하던 코드는 주석 처리
// if ((r = syscall_mem_map(0, oldfd, 0, newfd, ...)) < 0) { goto err; }

if (vpd[PDX(ova)]) {                              // ① 데이터 페이지들 먼저 올림
    for (i = 0; i < PDMAP; i += BY2PG) {
        pte = vpt[VPN(ova + i)];
        if (pte & PTE_V) {
            syscall_mem_map(0, (void *)(ova + i), 0, (void *)(nva + i),
                            pte & (PTE_D | PTE_LIBRARY));
        }
    }
}
if ((r = syscall_mem_map(0, oldfd, 0, newfd, ...)) < 0) { goto err; }  // ② FD 마지막
```

→ 중간 상태가 `p[0]=2, pipe=4`라 역시 `2 < 4`, 절대 `==`가 안 됩니다.

> 💡 이 방식의 요점은 "불변식을 안 깨는" 게 아니라 **"오판이 안 나는 방향으로만 깨지게" 만드는 것**입니다. fd가 pipe보다 항상 낮게 유지되므로 중간 어느 지점을 잘라도 거짓 EOF가 원천적으로 안 생깁니다. (참고: `duppage`도 같은 이유로 "child에 먼저 map 후 parent에 remap" 순서 — `user/lib/fork.c:92` 주석 "The page should be first mapped to the child before remapped in the parent. (Why?)")

#### 8-4. 읽는 쪽 보호막: `env_runs` 재검사

순서 재배치가 "쓰는 쪽(dup/close)"이 나쁜 중간 상태를 안 만들게 하는 장치라면, `_pipe_is_closed`의 `do-while` 루프는 "읽는 쪽" 보호막입니다. `fd_ref`와 `pipe_ref`를 **두 번 나눠 읽는 사이**에 스케줄 전환이 끼면 서로 다른 시점의 값을 짝지을 수 있기 때문입니다.

```c
do {
    runs = env->env_runs;          // 읽기 전 실행 횟수 기록
    fd_ref = pageref((void *)fd);
    pipe_ref = pageref((void *)p);
} while (runs != env->env_runs);   // 읽는 도중 스케줄 전환이 있었으면 다시
```

`env_runs`는 해당 env가 스케줄되어 실행된 횟수(`lib/env.c`에서 `env_run` 시 증가)입니다. 읽기 전후로 값이 같으면 그 사이에 이 env가 CPU를 뺏긴 적이 없다는 뜻 → 두 pageref가 한 순간의 일관된 스냅샷임이 보장됩니다.

즉 두 장치가 한 세트로 동작합니다: **순서 재배치는 관찰 대상이 나쁜 중간 상태를 안 갖게 하고, `env_runs` 재검사는 관찰 자체가 일관된 순간에 이뤄지도록 보장합니다.**

#### 8-5. 왜 락(lock)을 안 썼는가

- **락을 걸 공용 커널 원시연산이 없다.** MOS 파이프는 커널 버퍼가 아니라 **유저 공간 공유 페이지**로 구현되고, read/write/close 로직도 전부 유저 라이브러리에서 돕니다. 유저 공간에는 test-and-set 같은 하드웨어 원자 명령이나 커널 락 서비스가 없어 "락을 건다"는 선택지 자체가 사실상 없습니다. 있는 재료는 `pageref`와 `env_runs`뿐입니다.
- **보호할 구간이 판정 한 번으로 짧다.** 지켜야 할 건 `fd_ref == pipe_ref` 비교 한 순간의 일관성뿐이라, 매 read/write마다 락을 잡으면 배보다 배꼽이 큽니다(락 획득/해제 자체가 syscall).
- **락은 새 문제를 데려온다.** 데드락, 락 소유자 프로세스가 죽으면 락이 안 풀리는 문제 등. 순서 조정 + `env_runs`는 누가 죽든 잠금 상태로 남는 게 없습니다.

> **면접 한 줄 요약**: "파이프 fd는 Fd 페이지와 데이터 페이지 두 장이라 dup/close가 비원자적인데, 그 사이 clock interrupt가 끼면 `pageref(fd) == pageref(pipe)`가 순간적으로 성립해 `_pipe_is_closed()`가 거짓 EOF를 냅니다. 그래서 dup은 데이터 페이지를 먼저, close는 fd를 먼저 처리해 `pageref(fd) < pageref(pipe)` 불변식을 모든 중간 상태에서 유지했고, 판정부엔 `env_runs`로 읽기 원자성을 더한 lock-free 설계입니다."

---

### 9. Shell 명령 처리

Shell의 기본 구조는 다음입니다.

```text
while (1) {
    프롬프트 출력
    한 줄 입력
    fork()
      child  → runcmd(buf)
      parent → wait(child)
}
```

즉, shell 자체가 명령을 직접 실행하는 것이 아니라, 자식 shell 프로세스를 만들어 명령을 실행합니다.

---

### 10. 명령 파싱

Shell은 입력 문자열을 토큰 단위로 나눕니다.

지원하는 대표 문법은 다음입니다.

| 문법 | 의미 |
|---|---|
| `cmd arg1 arg2` | 일반 명령 실행 |
| `< file` | 표준 입력 리다이렉션 |
| `> file` | 표준 출력 리다이렉션 |
| `cmd1 | cmd2` | 파이프라인 |
| `;` | 순차 실행 |

예를 들어:

```sh
cat < a.txt | grep hello > out.txt
```

실행 흐름은 다음입니다.

```text
cat 프로세스 생성
  stdin을 a.txt로 변경

pipe 생성

grep 프로세스 생성
  stdin을 pipe read end로 변경
  stdout을 out.txt로 변경

cat stdout을 pipe write end로 변경
```

---

### 11. 리다이렉션 구현

`>`는 stdout을 파일로 바꿉니다.

```text
close(1)
open(file, O_WRONLY | O_CREAT)
새로 열린 fd가 1번이 되도록 구성
```

`<`는 stdin을 파일로 바꿉니다.

```text
close(0)
open(file, O_RDONLY)
새로 열린 fd가 0번이 되도록 구성
```

핵심은 fd 번호를 바꾸는 것이 아니라, **0번 또는 1번 fd가 가리키는 대상 자체를 바꾸는 것**입니다.

---

### 12. 파이프라인 구현

`cmd1 | cmd2`는 두 프로세스를 pipe로 연결합니다.

```text
pipe(p)
fork 왼쪽 명령
  close(1)
  dup(p[1], 1)
  close 불필요 fd
  runcmd(left)

fork 오른쪽 명령
  close(0)
  dup(p[0], 0)
  close 불필요 fd
  runcmd(right)
```

이렇게 하면 왼쪽 명령의 출력이 오른쪽 명령의 입력으로 들어갑니다.

---

### 13. Lab6에서 반드시 이해해야 할 질문

#### Q1. `spawn()`과 `fork()`의 차이는 무엇인가요?

`fork()`는 현재 프로세스의 주소 공간을 복제합니다. 반면 `spawn()`은 파일 시스템에서 ELF 파일을 읽어 새로운 프로그램을 실행하는 새 프로세스를 만듭니다.

#### Q2. pipe는 커널이 관리하나요?

MOS의 pipe는 커널 내부 버퍼가 아니라 유저 공간 공유 메모리로 구현됩니다. 커널은 필요한 페이지 매핑과 시스템 콜만 제공하고, 실제 pipe read/write 로직은 유저 라이브러리에서 처리합니다.

#### Q3. Shell에서 왜 명령 실행 전에 fork를 하나요?

Shell 자신이 명령으로 바뀌어 버리면 다음 명령을 받을 수 없습니다. 그래서 자식 프로세스를 만들어 명령을 실행하고, 부모 shell은 기다렸다가 다시 프롬프트를 출력합니다.

---

---

## Lab1~Lab6 연결 요약

| Lab | 추가되는 능력 | 핵심 개념 |
|---|---|---|
| Lab1 | 커널 실행 시작 | boot, ELF, linker script, printk |
| Lab2 | 메모리 관리 | Page, free list, pgdir, PTE, TLB |
| Lab3 | 프로세스 실행 | Env, Trapframe, exception, scheduler |
| Lab4 | 커널 서비스 호출 | syscall, IPC, fork, COW |
| Lab5 | 파일 저장/읽기 | FS server, block, bitmap, file descriptor |
| Lab6 | 사용자 인터페이스 | shell, spawn, pipe, redirection |

---

# 전체 면접 답변용 핵심 문장

### 운영체제 전체 구조

> 이 실험 OS는 MIPS 기반의 작은 운영체제로, 커널은 메모리 관리, 프로세스 관리, 예외 처리, 시스템 콜을 담당하고, 파일 시스템은 유저 공간 서버로 동작합니다. 유저 프로그램은 시스템 콜과 IPC를 통해 커널 및 파일 서버 기능을 사용합니다.

### 메모리 관리

> 물리 페이지는 `struct Page` 배열과 free list로 관리하고, 가상주소는 2단계 페이지 테이블을 통해 물리주소로 변환합니다. MIPS에서는 TLB miss를 커널이 직접 처리하므로, 페이지 테이블에서 PTE를 찾아 TLB에 refill하는 과정이 필요합니다.

### 프로세스 관리

> 프로세스는 `Env` 구조체로 관리되며, 각 프로세스는 Trapframe과 페이지 디렉토리를 가집니다. 예외나 인터럽트 발생 시 Trapframe에 현재 상태를 저장하고, 스케줄러가 다음 실행할 프로세스를 선택한 뒤 `env_run()`으로 주소 공간과 레지스터 상태를 전환합니다.

### 시스템 콜

> 유저 프로그램은 커널 함수를 직접 호출하지 못하므로 MIPS `syscall` 명령을 통해 예외를 발생시킵니다. 커널은 시스템 콜 번호를 기준으로 `syscall_table`에서 함수를 찾아 실행하고, 결과를 Trapframe의 `v0`에 저장한 뒤 유저 모드로 복귀합니다.

### fork와 COW

> `fork()`는 부모 주소 공간을 즉시 복사하지 않고, 부모와 자식이 같은 물리 페이지를 COW로 공유하게 합니다. 이후 쓰기가 발생하면 TLB Mod 예외가 발생하고, 유저 page fault handler가 새 페이지를 할당해 내용을 복사한 뒤 쓰기 가능하게 재매핑합니다.

### 파일 시스템

> 파일 시스템은 커널 내부가 아니라 유저 공간의 `fs_serv` 프로세스로 구현됩니다. 일반 유저 프로세스는 파일 요청을 IPC로 파일 서버에 보내고, 파일 서버는 디스크 블록과 파일 메타데이터를 관리하여 결과를 반환합니다.

### Shell

> Shell은 사용자 명령을 읽어 파싱하고, `fork`, `spawn`, `dup`, `pipe`를 조합하여 명령 실행, 리다이렉션, 파이프라인을 구현합니다. 이를 통해 사용자는 완성된 OS 인터페이스를 사용할 수 있습니다.

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

- **pipe 경쟁 조건**: fd 하나가 페이지 두 장(Fd/데이터)이라 dup/close가 비원자적이고, 그 사이 clock interrupt가 끼면 `pageref(fd) == pageref(pipe)`가 순간 성립해 거짓 EOF가 나는 문제. dup은 데이터 먼저·close는 fd 먼저 처리해 `pageref(fd) < pageref(pipe)` 불변식을 안전한 방향으로만 깨지게 하고, `env_runs`로 읽기 원자성을 더한 lock-free 설계. (→ Lab6 §8)
- **COW 무한 페이지 폴트**: 폴트 처리(쓰기)가 또 폴트를 유발하는 자기참조 문제. 유저 pgfault 핸들러를 일반 스택이 아닌 별도 예외 스택(UXSTACK)에서 실행해 차단. (→ Lab4 §7-2)
- **TLB miss 처리**: MIPS에서 하드웨어가 아닌 소프트웨어가 TLB를 관리하므로 핸들러가 빨리 끝나야 함 (TLB 핸들러 안에서 또 TLB miss가 나면 무한 루프 — COW 무한 폴트와 같은 "예외 처리의 자기참조" 계열).

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

---

## 합격 자소서 말투로 정리

**현상이 아니라 구조를 기준으로 원인을 분리하는 엔지니어로 성장했습니다**

저는 MIPS R3000 기반의 운영체제를 부트 코드부터 쉘까지 직접 구현하며, 눈에 보이는 증상이 아니라 시스템의 구조와 데이터를 기준으로 문제의 원인을 분리하는 방법을 배웠습니다. 운영체제는 메모리 관리, 프로세스 전환, 시스템 콜, 파일 시스템, 쉘이 한 흐름으로 맞물려 동작하기 때문에, 표면에 드러난 오류 하나를 고치는 것만으로는 같은 문제가 반복된다는 점을 절감했기 때문입니다.

대표적으로 fork 이후 두 프로세스가 같은 물리 페이지를 공유하는 Copy-On-Write 구간에서, 쓰기 시점에만 페이지가 복사되어야 함에도 데이터가 어긋나는 문제를 확인했습니다. 저는 이를 단순한 복사 누락으로 보지 않고, TLB Mod 예외가 발생하는 지점과 페이지 참조 횟수(pp_ref)의 변화를 기준으로 원인을 분리해 나갔습니다. 특히 유저 레벨 page fault 핸들러가 예외 스택 위에서 동작해야 하는 이유를 추적하면서, 권한 비트와 참조 카운트가 어긋나는 지점을 좁혀갈 수 있었습니다.

pipe의 EOF 감지 문제에서도 같은 접근을 키울 수 있었습니다. 처음에는 닫힘이 간헐적으로만 감지되는 현상을 마주했지만, 이를 우연한 타이밍 문제로 넘기지 않고 fd 페이지와 데이터 페이지의 참조 수 불변식이 close 도중 깨질 수 있다는 구조적 원인으로 좁혔습니다. 이후 env_runs 값으로 스케줄러 전환 여부를 확인하고 불변식을 재검사하는 방식으로 경쟁 조건을 점진적으로 줄여 나갔습니다. 단번에 해결한 것이 아니라, 로그와 참조 수라는 근거를 기준으로 가설을 좁혀가며 안정화한 경험이었습니다.

이렇게 로그와 데이터 구조를 기준으로 원인을 분리하고 점진적으로 개선해 본 경험은, 시스템의 동작을 추적하고 장애 원인을 규명하는 직무 역량으로 이어진다고 생각합니다. 이러한 경험을 활용하여, 복잡하게 얽힌 시스템에서도 증상이 아닌 근본 원인을 짚어내고 안정성을 높이는 데 기여하고 싶습니다.
