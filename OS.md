# BUAA-OS-2019 lab0-lab6 코드 해설

대상 레포지토리: https://github.com/login256/BUAA-OS-2019.git

분석 기준:

- 로컬 분석용 clone 위치: `C:\Users\zoonc\Desktop\자소서\_codex_BUAA-OS-2019`
- 원격 branch 기준: `origin/lab0`부터 `origin/lab6`까지, 그리고 각 lab의 `Extra`, `exam`, `result` 계열 branch
- 읽기 방식: checkout 충돌을 피하기 위해 `git ls-tree`, `git show`, `git diff --stat` 중심으로 확인
- 주의: `*-result` branch 대부분은 실제 소스가 아니라 자동 채점 로그만 담고 있다. 코드 흐름은 기본 lab branch와 `Extra`/`exam` branch를 중심으로 봐야 한다.

## 0. 분석 계획과 서브에이전트 분담

요청 범위가 넓어서 lab별로 독립 분석을 맡겼고, 최종 문서는 그 결과와 직접 확인한 파일 구조를 합쳐 작성했다.

| 담당 | 범위 | 핵심 산출 |
|---|---|---|
| subagent-lab0 | `lab0`, `lab0-Extra`, `lab0-exam`, 결과 branch | C/Makefile/Bash 기초 과제와 branch별 차이 |
| subagent-lab1 | `lab1`, `lab1-1`, `lab1-2`, 결과 branch | MIPS 초기 커널, `printf`, `readelf`, 계산기/printf 확장 |
| subagent-lab2 | `lab2`, `lab2-1`, `lab2-2`, 결과 branch | 물리 메모리, page allocator, page table, TLB refill |
| subagent-lab3 | `lab3`, `lab3-1`, `lab3-2`, 결과 branch | Env, ELF loading, trap/syscall, scheduler |
| subagent-lab4 | `lab4`, `lab4-1`, `lab4-2`, 결과 branch | COW fork, page fault upcall, IPC |
| subagent-lab5 | `lab5`, `lab5-1`, `lab5-2`, 결과 branch | 파일 시스템 서버, block cache, IDE, file IPC |
| subagent-lab6 | `lab6` | shell, spawn, fd, pipe, user command |

## 1. 전체 구조 한눈에 보기

이 레포는 BUAA OS 실습용 MIPS 운영체제 코드다. 전체 흐름은 JOS 계열 교육용 OS와 유사하다. 커널이 모든 기능을 크게 품기보다, 작은 kernel primitive를 제공하고 user library와 user-level server가 기능을 조립한다.

lab별 확장 흐름은 다음과 같다.

| lab | 큰 주제 | 새로 등장하는 핵심 |
|---|---|---|
| lab0 | 실습 환경 준비 | C 입출력, Makefile, shell script, 제출/채점 구조 |
| lab1 | 커널 부팅과 출력 | MIPS `_start`, linker script, GXemul console, kernel `printf`, `readelf` |
| lab2 | 메모리 관리 | 64MB 물리 메모리 모델, `struct Page`, free list, page directory/table, TLB |
| lab3 | 사용자 환경 | `Env`, ELF user image loading, trap/syscall, timer scheduling |
| lab4 | user-level OS 기능 | COW `fork`, user page fault handler, IPC |
| lab5 | 파일 시스템 | user-level `fs_serv`, block cache, IDE, file descriptor/file IPC |
| lab6 | 사용자 셸 완성 | `spawn`, `sh`, pipe, redirection, `cat/ls/echo/num` |

최종 lab6 기준 주요 디렉터리는 다음처럼 읽으면 된다.

| 디렉터리 | 역할 |
|---|---|
| `boot/` | MIPS CPU가 처음 들어오는 assembly entry. CP0 초기화, stack 설정, C `main()` 진입 |
| `drivers/gxconsole/` | GXemul console MMIO 출력 장치 |
| `include/` | 커널/user/fs가 공유하는 주소 배치, 구조체, syscall 번호, 자료구조 |
| `init/` | 커널 초기화와 최초 user env 생성 |
| `lib/` | 커널 쪽 공통 코드. trap, syscall, env, scheduler, printf, ELF loader |
| `mm/` | 물리 페이지와 page table/TLB 관리 |
| `fs/` | user-level 파일 시스템 서버와 디스크 이미지 생성 도구 |
| `user/` | user runtime, syscall wrapper, fd, file, pipe, shell, command, tests |
| `readelf/` | ELF 구조를 학습하기 위한 host-side 보조 도구 |
| `tools/` | linker script, fsformat 등 빌드 보조 파일 |
| `gxemul/` | 에뮬레이터 실행 보조 파일, image, binary 산출물 |

## 2. 공통 실행 흐름

완성형 lab6 기준으로 OS가 살아나는 흐름은 다음과 같다.

```text
GXemul loads gxemul/vmlinux
  -> boot/start.S:_start
  -> CP0 status/watch/config 초기화
  -> kernel stack 설정
  -> init/main.c:main()
  -> init/init.c:mips_init()
  -> memory init, env init, trap init, timer init
  -> ENV_CREATE(user_icode), ENV_CREATE(fs_serv)
  -> scheduler
  -> user/icode.c
  -> spawn init.b
  -> user/init.c
  -> open console, dup stdout
  -> spawn sh.b
  -> user/sh.c command loop
```

커널과 user space의 관계는 이렇게 나뉜다.

- kernel: page allocation, page table manipulation, env creation, trap/syscall dispatch, IPC primitive, device read/write syscall 제공
- user library: `fork`, `spawn`, `open`, `read`, `write`, `pipe`, `dup`, `wait` 같은 Unix-like API 조립
- user server: `fs_serv`가 파일 시스템을 맡고, 일반 user process는 IPC와 page mapping으로 파일을 사용

## 3. lab0: C, Makefile, Bash 워밍업

### 3.1 branch 구조

| branch | 역할 |
|---|---|
| `origin/lab0` | 기본 실습. C 피보나치, Makefile, Bash script |
| `origin/lab0-result` | 기본 실습 채점 로그 |
| `origin/lab0-Extra` | 헤더/소스 분리와 다중 Makefile 빌드 |
| `origin/lab0-Extra-result` | Extra 채점 로그 |
| `origin/lab0-exam` | `find`, `grep` 기반 시험용 shell script |
| `origin/lab0-exam-result` | exam 채점 로그 |

### 3.2 기본 파일 역할

| 파일 | 역할 |
|---|---|
| `src/Makefile` | `gcc -o fibo fibo.c`로 단일 C 파일을 빌드한다. |
| `src/fibo.c` | 정수 `n`을 입력받아 피보나치 수열 앞 `n`개를 출력한다. |
| `src/fibo` | 이미 포함된 실행 파일. 채점에서는 새 빌드 결과와 구분해야 한다. |
| `src/sh_test/hello_os.sh` | 입력 파일에서 8, 32, 128, 512, 1024번째 줄을 추출해 출력 파일로 저장한다. |
| `src/sh_test/file` | shell script 테스트용 큰 입력 파일이다. |
| `src/sh_test/file.c`, `hello.c` | 간단한 `printf` 예제 파일이다. |
| `dst/*` | 제출용 결과 위치. `src`의 대응 파일이 들어 있다. |

`hello_os.sh`의 핵심은 `sed -n`으로 특정 줄만 뽑는 것이다. OS 코드는 아니지만, 이후 실습에서 자동 채점 입력/출력과 shell 도구 사용에 익숙해지게 한다.

### 3.3 Extra와 exam

`lab0-Extra`는 다음 구조를 가진다.

```text
Makefile
code/
  Makefile
  fibo.c
  main.c
include/
  fibo.h
```

기본 lab0이 단일 `fibo.c`였다면 Extra는 `main.c`, `fibo.c`, `fibo.h`를 분리한다. 상위 Makefile이 하위 `code/Makefile`을 호출하고, `main.o`와 `fibo.o`를 링크한다. 이후 OS 커널처럼 여러 모듈을 빌드하는 구조의 아주 작은 예고편이다.

`lab0-exam`은 `dst_exam/test.sh`를 추가한다. `find dir/ -name lab0_x`로 파일 이름을 찾고, `grep -n -r "hello OS lab0"`으로 문자열 위치를 찾는다. shell 도구를 정확히 조합할 수 있는지 보는 branch다.

## 4. lab1: MIPS 초기 커널, printf, readelf

### 4.1 branch 구조

| branch | 역할 |
|---|---|
| `origin/lab1` | 기본 lab1 구현. boot, linker script, printf, readelf |
| `origin/lab1-printfTest` | `lab1`과 같은 커밋. printf 테스트용 |
| `origin/lab1-1-Extra` | ELF endian 처리 확장 |
| `origin/lab1-1-exam` | section header 대신 program header offset 출력 |
| `origin/lab1-2-Extra` | MIPS assembly 계산기 과제 |
| `origin/lab1-2-exam` | `printf` 배열 출력 포맷 확장 |
| `*-result` | 채점 로그 |

### 4.2 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `Makefile` | `boot`, `drivers`, `init`, `lib`를 빌드하고 `gxemul/vmlinux`를 링크한다. |
| `include.mk` | MIPS cross compiler와 공통 CFLAGS를 정의한다. |
| `boot/start.S` | kernel entry `_start`. CP0 초기화, watch exception 비활성화, cache 설정, stack 설정, `main` 호출. |
| `tools/scse0_3.lds` | kernel ELF link script. `_start` entry와 `0x80010000` 커널 text 주소를 잡는다. |
| `init/main.c` | C 진입점. 시작 메시지를 출력하고 `mips_init()`을 호출한다. |
| `init/init.c` | 초기화 골격. `FTEST`, `PTEST` 같은 채점 hook이 존재한다. |
| `lib/printf.c` | 커널용 `printf` wrapper. format engine 결과를 console 출력 callback으로 보낸다. |
| `lib/print.c` | 실제 format parser. `%d`, `%x`, `%s`, `%c`, width, long 등을 처리한다. |
| `drivers/gxconsole/console.c` | GXemul console MMIO 주소에 문자를 써서 출력한다. |
| `drivers/gxconsole/dev_cons.h` | console device base와 offset 정의. |
| `readelf/main.c` | host에서 ELF 파일을 읽고 `readelf()`를 호출하는 테스트 프로그램. |
| `readelf/readelf.c` | ELF magic 확인, section/program header 파싱. |
| `readelf/kerelf.h` | ELF32 header 구조체 정의. |
| `include/asm/*.h` | MIPS register alias, CP0 register 번호, assembly 함수 macro. |
| `include/trap.h`, `include/stackframe.h` | 이후 lab에서 쓸 trapframe 구조와 SAVE/RESTORE macro. lab1에서는 예고 구조에 가깝다. |

### 4.3 코드 흐름

초기 커널 실행 흐름:

```text
GXemul
  -> gxemul/vmlinux 로드
  -> boot/start.S:_start
  -> CP0_STATUS = 0
  -> WATCHLO/WATCHHI = 0
  -> CP0_CONFIG 조정
  -> sp = 0x80400000
  -> init/main.c:main()
  -> printf("main is start")
  -> init/init.c:mips_init()
  -> panic() 또는 채점 hook
```

출력 흐름:

```text
printf(fmt, ...)
  -> lp_Print(callback, fmt, va_list)
  -> myoutput()
  -> printcharc()
  -> GXemul console MMIO write
```

### 4.4 Extra와 exam

`lab1-1-Extra`는 ELF endian 처리를 추가한다. `EI_DATA`가 little endian인지 big endian인지 보고 `e_shoff`, `e_shnum`, `e_shentsize`, `sh_addr` 등을 필요하면 byte reverse한다.

`lab1-1-exam`은 section header가 아니라 program header를 순회한다. `e_phoff`, `e_phnum`, `e_phentsize`를 이용해 `Elf32_Phdr`의 `p_offset`을 출력한다.

`lab1-2-Extra`는 `extra/calculator.S`를 추가하고, `init/main.c`에서 `mips_init()` 대신 `calculator()`를 호출하게 바꾼다. console input을 polling하고 `+`, `-`, `D`, newline, `Q` 같은 입력을 처리하는 MIPS assembly 계산기다.

`lab1-2-exam`은 `lib/print.c`를 바꿔 배열 출력 포맷을 추가한다. 예를 들어 `#숫자`를 배열 길이로 해석하고 `%a`, `%A`, `%la`, `%lA` 계열에서 int/long 배열을 `{1,2,3}` 형태로 출력하는 식이다.

## 5. lab2: 물리 메모리, 페이지 테이블, TLB

### 5.1 branch 구조

| branch | 역할 |
|---|---|
| `origin/lab2` | 기본 lab2 구현 |
| `origin/lab2-1-Extra` | 물리 메모리 allocator 변형과 검사 함수 |
| `origin/lab2-1-exam` | page 상태 조회 시험 |
| `origin/lab2-2-Extra` | page table 주소 계산/recursive mapping 실험 |
| `origin/lab2-2-exam` | page mapping count 시험 |
| `*-result` | 채점 로그 |

### 5.2 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `mm/pmap.c` | lab2 핵심. 메모리 탐지, boot allocator, page allocator, page table 조작, TLB invalidate, `pageout` 구현. |
| `mm/tlb_asm.S` | `tlbp`, `tlbwi`로 특정 TLB entry를 무효화하는 assembly. |
| `include/mmu.h` | `BY2PG`, `PDMAP`, `PDX`, `PTX`, `PTE_*`, `KERNBASE`, `ULIM`, `UTOP`, `PADDR`, `KADDR` 정의. |
| `include/pmap.h` | `struct Page`, page/page number/address 변환 macro, pmap 함수 선언. |
| `include/queue.h` | free list에 쓰는 BSD 스타일 linked list macro. |
| `lib/genex.S` | TLB refill 예외 처리. page table을 software로 걸어 TLB에 쓴다. |
| `init/init.c` | `mips_detect_memory`, `mips_vm_init`, `page_init`, 검사 함수 호출. |
| `tools/scse0_3.lds` | `end` symbol과 kernel memory 배치에 영향을 준다. |

### 5.3 메모리 초기화 흐름

```text
mips_init()
  -> mips_detect_memory()
       maxpa = 64MB
       npage = 64MB / 4096
  -> mips_vm_init()
       boot_pgdir 할당
       pages[] 할당 후 UPAGES에 매핑
       envs[] 할당 후 UENVS에 매핑
  -> page_init()
       freemem 이전 page는 used
       이후 page는 page_free_list에 삽입
  -> page_check()
```

### 5.4 allocator와 page table

`alloc(n, align, clear)`는 부팅 초기에만 쓰는 bump allocator다. 아직 page allocator가 준비되기 전 page directory, `pages`, `envs` 같은 핵심 구조를 잡기 위해 사용한다.

`page_alloc()`은 `page_free_list`에서 `struct Page`를 꺼내고 해당 page 내용을 `bzero`로 지운다. `page_free()`는 refcount가 0인 page를 free list로 돌려준다.

`boot_pgdir_walk()`는 초기 page table walker다. PDE가 없고 `create`가 true면 `alloc()`으로 새 page table을 만든다.

`pgdir_walk()`는 runtime page table walker다. PDE가 없고 `create`가 true면 `page_alloc()`으로 page table page를 만든다.

`page_insert()`는 물리 page를 가상 주소에 매핑한다. 기존 mapping이 있으면 `page_remove()`로 지우고, TLB stale entry를 막기 위해 `tlb_invalidate()`를 호출한다.

`page_lookup()`은 가상 주소에 연결된 `struct Page`를 찾고, 필요하면 PTE pointer도 반환한다.

`page_remove()`는 mapping을 제거하고 refcount를 줄인 뒤 0이면 page를 free한다.

### 5.5 MIPS TLB refill

MIPS는 TLB miss가 나면 hardware가 page table을 자동으로 완전히 걷지 않는다. `lib/genex.S`의 refill handler가 `CP0_BADVADDR`를 보고, 현재 context의 page directory에서 PDE/PTE를 찾은 뒤 `CP0_ENTRYLO0`와 `tlbwr`로 TLB를 채운다.

PDE나 PTE가 없으면 `pageout(va, context)`로 넘어간다. 이 함수는 새 page를 할당해 faulting VA에 매핑한다. lab2는 단순 demand allocation의 맛을 보여준다.

### 5.6 Extra와 exam

`lab2-1-Extra`는 allocator 방향을 바꾸고, `physical_memory_manage_check()` 같은 검사 함수를 추가한다. free list visibility도 바뀐다.

`lab2-1-exam`은 `get_page_status(int pa)`를 추가한다. 특정 물리 주소가 free list에 있는지, refcount가 어떤지에 따라 상태를 출력한다.

`lab2-2-Extra`는 `cal_page(taskKind, va, n, pgdir)`로 page table 주소 계산과 recursive/self mapping 개념을 실험한다.

`lab2-2-exam`은 `count_page(pgdir, cnt, size)`를 추가해 page directory, page table, mapped physical page의 참조 횟수를 센다.

## 6. lab3: Env, ELF loading, trap/syscall, scheduler

### 6.1 branch 구조

| branch | 역할 |
|---|---|
| `origin/lab3` | 기본 lab3 구현 |
| `origin/lab3-1-Extra` | env parent/root 관련 실험 |
| `origin/lab3-1-exam` | priority가 들어간 envid 실험 |
| `origin/lab3-2-Extra` | MIPS arithmetic overflow exception 실험 |
| `origin/lab3-2-exam` | priority를 time budget처럼 쓰는 scheduler 시험 |
| `*-result` | 채점 로그 |

### 6.2 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `include/env.h` | `struct Env`: trapframe, env id, parent id, status, page directory, scheduler link, priority. |
| `lib/env.c` | env free list, `env_alloc`, `env_setup_vm`, ELF loading, `env_run`, `env_destroy`. |
| `lib/env_asm.S` | `env_pop_tf`, `lcontext`. user mode로 돌아가기 위한 trapframe restore와 context switch. |
| `lib/kernel_elfloader.c` | ELF `PT_LOAD` segment를 읽고 callback으로 env address space에 적재한다. |
| `include/kerelf.h` | ELF32 header/program header 구조체. |
| `lib/sched.c` | runnable env를 골라 `env_run()`하는 scheduler. |
| `lib/traps.c` | exception handler vector 등록. |
| `lib/genex.S` | interrupt, TLB, syscall, mod exception assembly entry. |
| `lib/syscall.S` | syscall exception 진입 후 syscall table dispatch. |
| `lib/syscall_all.c` | kernel syscall 함수 구현. lab3에서는 `putchar`, `getenvid`가 중심이고 이후 lab용 함수도 준비된다. |
| `init/code_a.c`, `init/code_b.c` | user A/B binary를 C array로 담은 파일. |

### 6.3 Env 생성 흐름

```text
mips_init()
  -> env_init()
       envs[]를 ENV_FREE로 초기화
       env_free_list에 삽입
  -> ENV_CREATE_PRIORITY(user_A, 2)
  -> ENV_CREATE_PRIORITY(user_B, 1)
       env_alloc()
         env_setup_vm()
           새 page directory 할당
           user 영역은 비움
           UTOP 이상 kernel 영역은 boot_pgdir 복사
           VPT/UVPT self mapping 설정
         env_id/status/parent/priority/trapframe 초기화
       load_icode()
         user stack page mapping
         ELF segment loading
         env_tf.pc = entry point
  -> trap_init()
  -> kclock_init()
  -> scheduler
```

### 6.4 trap/syscall 흐름

```text
user syscall instruction
  -> exception code 8
  -> boot/start.S exception vector
  -> lib/genex.S:handle_sys
  -> SAVE_ALL로 trapframe 저장
  -> syscall number와 args 읽기
  -> sys_call_table[index] 호출
  -> return value를 v0에 저장
  -> env_pop_tf / RESTORE
  -> user mode 복귀
```

Timer interrupt는 scheduler로 이어진다. TLB refill은 lab2의 page table lookup과 이어지고, Mod exception은 lab4 COW fault의 기반이 된다.

### 6.5 ELF loading

`load_elf()`는 ELF magic을 확인하고 program header를 순회한다. `PT_LOAD` segment마다 `load_icode_mapper()`가 page를 할당하고 file-backed bytes를 복사한다. `p_memsz`가 `p_filesz`보다 큰 나머지 영역은 bss처럼 0으로 채운다. entry point는 `env_tf.pc`가 된다.

### 6.6 Extra와 exam

`lab3-1-Extra`는 `check_same_root(envid1, envid2)`, `kill_all(envid)` 같은 process tree 계열 함수를 추가한다.

`lab3-1-exam`은 env id에 priority 정보를 직접 넣는 `newmkenvid`, `newenvid2env`, `output_env_info` 계열을 추가한다.

`lab3-2-Extra`는 overflow exception을 다룬다. assembly에서 의도적으로 overflow를 만들고, exception code 12를 handler에 연결해 faulting instruction과 register 정보를 본다.

`lab3-2-exam`은 `user_C`와 `sched_new.c`를 추가한다. priority를 실행 budget처럼 줄이고, 0이 되면 env를 destroy하는 변형 scheduler다.

## 7. lab4: user-level fork, COW, page fault upcall, IPC

### 7.1 branch 구조

| branch | 역할 |
|---|---|
| `origin/lab4` | 기본 lab4 구현 |
| `origin/lab4-result` | 채점 로그 |
| `origin/lab4-1-Extra` | IPC/스케줄링 실험 |
| `origin/lab4-1-exam` | syscall ABI 가변 인자 시험 |
| `origin/lab4-2-Extra` | page fault/COW instrumentation |
| `origin/lab4-2-exam` | `tfork()` thread-like fork 실험 |
| `origin/lab4-2-exam-offline`, `origin/lab4-2-exam-test` | offline/test 변형 |

### 7.2 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `include/mmu.h` | `UXSTACKTOP`, `PTE_COW`, `PTE_LIBRARY` 등 lab4 핵심 주소/권한 정의. |
| `include/env.h` | IPC 필드, page fault handler, exception stack top 필드가 추가된다. |
| `lib/syscall_all.c` | `sys_mem_alloc`, `sys_mem_map`, `sys_mem_unmap`, `sys_env_alloc`, `sys_set_pgfault_handler`, `sys_ipc_*` 구현. |
| `lib/traps.c` | page fault 발생 시 user exception stack에 trapframe을 쌓고 handler로 EPC를 바꾼다. |
| `user/pgfault.c` | user page fault handler를 등록하고 exception stack을 할당한다. |
| `user/fork.c` | user-level `fork`, COW page duplication, COW fault handler. |
| `user/ipc.c` | `ipc_send`, `ipc_recv` wrapper. |
| `user/syscall_lib.c` | user syscall wrapper 함수 모음. |
| `user/syscall_wrap.S` | MIPS `syscall` instruction을 실행하는 얇은 wrapper. |
| `user/fktest.c`, `try_fk.c`, `pingpong*.c` | fork, COW, IPC 테스트. |

### 7.3 COW fork 흐름

```text
fork()
  -> set_pgfault_handler(pgfault)
  -> syscall_env_alloc()
       kernel copies trapframe
       child return value v0 = 0
       child status = ENV_NOT_RUNNABLE
  -> parent scans UVPT/VPT for mapped user pages
  -> writable page:
       map child page as PTE_COW
       remap parent page as PTE_COW
  -> read-only/shared page:
       map with original permission
  -> allocate child UXSTACK
  -> set child pgfault handler
  -> set child status ENV_RUNNABLE
  -> parent returns child envid
```

핵심은 fork 정책이 kernel 안에 박혀 있지 않다는 점이다. kernel은 page map/unmap/env alloc primitive만 제공하고, user library가 COW fork를 완성한다.

### 7.4 COW page fault 흐름

```text
user writes to COW page
  -> MIPS Mod exception
  -> kernel page_fault_handler()
       trapframe을 user exception stack에 복사
       EPC = env_pgfault_handler
  -> user __asm_pgfault_handler
  -> user pgfault(va)
       fault page가 COW인지 확인
       temp page 할당
       old page 내용 복사
       original VA에 writable private page remap
```

### 7.5 IPC 흐름

```text
receiver:
  ipc_recv(dstva)
    -> sys_ipc_recv(dstva)
       env_ipc_recving = 1
       env_ipc_dstva = dstva
       status = ENV_NOT_RUNNABLE
       yield

sender:
  ipc_send(to, val, srcva, perm)
    -> sys_ipc_can_send()
       target이 recving이면 value/from/perm 설정
       srcva가 있으면 page mapping 전달
       target status = ENV_RUNNABLE
```

IPC는 lab5 파일 서버의 기반이다. 파일 서버는 request page를 받고, 필요하면 file descriptor/data page를 client에게 mapping해준다.

### 7.6 Extra와 exam

`lab4-1-Extra`는 `pingpong_a/b` 실행을 중심으로 IPC와 scheduler를 관찰한다.

`lab4-1-exam`은 `SYS_smp`와 varargs `msyscall` 등 syscall 인자 처리 ABI를 시험한다.

`lab4-2-Extra`는 page fault 횟수, fault instruction 등을 출력하는 instrumentation을 추가한다.

`lab4-2-exam`은 `tfork()`를 추가한다. 일반 fork와 달리 일부 영역은 copy하고 user stack은 COW로 공유하는 thread-like fork 실험이다.

## 8. lab5: user-level 파일 시스템 서버

### 8.1 branch 구조

| branch | 역할 |
|---|---|
| `origin/lab5` | 기본 파일 시스템 구현 |
| `origin/lab5-1-Extra` | console interrupt/kcons 실험 scaffold |
| `origin/lab5-1-exam` | user-level console MMIO 시험 |
| `origin/lab5-2-Extra` | symbolic link 과제 |
| `origin/lab5-2-exam` | checksum metadata 시험 |
| `*-result` | 채점 로그 |

### 8.2 핵심 파일 역할

| 파일 | 역할 |
|---|---|
| `include/fs.h` | on-disk `struct File`, `struct Super`, file type, FS request 번호와 request 구조체. |
| `fs/fs.h` | FS 서버 내부 constant/prototype. `DISKMAP`, sector/block 변환, IDE 함수. |
| `fs/fs.c` | lab5 핵심. block cache, bitmap, block alloc/free, superblock, path lookup, file mapping, truncate, flush, remove. |
| `fs/ide.c` | GXemul IDE MMIO를 syscall로 읽고 쓴다. |
| `fs/serv.c` | FS server main loop. client IPC request 처리. |
| `fs/fsformat.c` | host에서 `fs.img`를 만드는 도구. |
| `fs/test.c` | FS 내부 테스트. |
| `user/fd.h`, `user/fd.c` | file descriptor abstraction. `Fd`, `Dev`, `Stat`, dispatch layer. |
| `user/fsipc.c` | FS server에 IPC request를 보내는 client stub. |
| `user/file.c` | user-level `open`, file read/write/truncate/remove/sync. |
| `user/fstest.c` | user 관점 file system 통합 테스트. |

### 8.3 파일 시스템 레이아웃

이 파일 시스템은 block size를 page size와 같게 둔다.

- `BY2BLK == BY2PG == 4096`
- block 0: reserved
- block 1: superblock
- block 2부터: bitmap blocks
- root directory: `super->s_root`
- directory: `struct File` 배열을 담은 file
- regular file: direct block 10개 + indirect block 1개

`struct File`은 디스크에 그대로 저장되는 metadata이므로 크기와 padding이 중요하다. lab5-2-exam의 checksum 과제가 이 제약을 건드린다.

### 8.4 block cache 흐름

```text
diskaddr(blockno)
  -> DISKMAP + blockno * BY2BLK

read_block(blockno)
  -> 이미 mapped면 cache hit
  -> 아니면 syscall_mem_alloc()
  -> ide_read()로 disk sector를 page에 읽음

write_block(blockno)
  -> mapped block 내용을 ide_write()
  -> 다시 mem_map하여 dirty bit 정리

alloc_block()
  -> bitmap에서 free bit 검색
  -> used로 변경
  -> bitmap block write
  -> 해당 block map
```

### 8.5 file open/read/write 흐름

```text
user open(path, mode)
  -> fd_alloc()
  -> fsipc_open(path, mode, fd)
  -> IPC to fs_serv
  -> fs/serv.c:serve_open()
  -> fs/fs.c:file_open()
  -> walk_path() -> dir_lookup()
  -> Filefd page를 client fd address에 mapping
  -> user open()이 file size 기준으로 fsipc_map()
  -> fs/serv.c:serve_map()
  -> file_get_block()
  -> file data block page를 client FILEBASE에 mapping
```

이후 일반 file `read()`는 매번 kernel이나 FS server로 가지 않는다. 이미 mapping된 file data page에서 user buffer로 복사한다. write도 mapped page에 쓰고, close/dirty/sync 때 FS server가 flush한다.

### 8.6 Extra와 exam

`lab5-1-Extra`는 kcons/console interrupt 관련 파일을 추가하지만, 일부 file operation이 scaffold 형태로 비워져 있다.

`lab5-1-exam`은 user-level에서 console MMIO를 직접 다루는 `dev_cons.c` 계열을 추가한다.

`lab5-2-Extra`는 symbolic link를 추가한다. `FTYPE_SYML`과 `.lnk` 파일을 도입하고, symlink 파일 내용이 target path가 되는 단순 모델이다.

`lab5-2-exam`은 `struct File`에 checksum 필드를 추가한다. disk format 크기를 유지하기 위해 padding을 줄여야 한다.

## 9. lab6: shell, spawn, fd, pipe

### 9.1 핵심 추가점

lab6는 lab5까지 만든 재료를 묶어서 작은 Unix-like user space를 만든다.

| 기능 | 핵심 파일 |
|---|---|
| 최초 user bootstrap | `user/icode.c`, `user/init.c` |
| command shell | `user/sh.c` |
| executable loading | `user/spawn.c` |
| fd abstraction | `user/fd.h`, `user/fd.c` |
| file fd | `user/file.c`, `user/fsipc.c` |
| console fd | `user/console.c` |
| pipe | `user/pipe.c` |
| commands | `user/cat.c`, `user/ls.c`, `user/echo.c`, `user/num.c` |
| tests | `user/testpipe.c`, `user/testfdsharing.c`, `user/testptelibrary.c` |

### 9.2 user boot 흐름

```text
kernel mips_init()
  -> ENV_CREATE(user_icode)
  -> ENV_CREATE(fs_serv)

user/icode.c
  -> open /motd
  -> read and print
  -> spawnl("init.b", ...)

user/init.c
  -> opencons()
  -> dup(0, 1)
  -> 반복적으로 spawn("sh.b")
```

### 9.3 spawn 흐름

```text
spawn(prog, argv)
  -> open(prog)
  -> ELF header read
  -> ET_EXEC/magic 검사
  -> syscall_env_alloc()
  -> init_stack(child, argv)
  -> program header 순회
       PT_LOAD segment마다 child address space에 page alloc/map
       BUFPAGE를 통해 file content 복사
       bss 영역은 zero
  -> 부모의 PTE_LIBRARY page를 child에 공유 mapping
  -> child trapframe pc = elf entry
  -> child status = ENV_RUNNABLE
```

`spawn`은 kernel loader가 아니라 user-level loader다. lab3의 `load_icode()`가 kernel에서 초기 user binary를 로드했다면, lab6의 `spawn()`은 이미 실행 중인 user process가 파일 시스템을 통해 새 executable을 읽고 새 env에 적재한다.

### 9.4 fd와 dup

fd는 단순한 정수 배열이 아니다. fd 번호는 특정 virtual address 영역에 대응한다.

- fd page: `Fd` metadata가 들어 있는 page
- data page: file/pipe/console device별 data가 들어 있는 page
- `Dev`: device별 `read`, `write`, `close`, `stat` 함수 table

`dup(oldfd, newfd)`는 fd 번호만 복사하지 않는다. old fd의 data page들을 new fd 영역에 `syscall_mem_map()`으로 공유 mapping하고 마지막에 fd page 자체도 mapping한다. 그래서 shell redirection과 pipe가 같은 fd 추상화 위에서 돌아간다.

### 9.5 pipe 흐름

```text
pipe(pfd)
  -> read fd 할당
  -> write fd 할당
  -> Pipe data page 할당
  -> read fd와 write fd가 같은 Pipe page를 공유

pipewrite()
  -> buffer full이면 yield
  -> reader closed면 0 반환
  -> ring buffer에 byte write

piperead()
  -> buffer empty이면 yield
  -> writer closed면 0 반환
  -> ring buffer에서 byte read
```

pipe close 여부는 kernel pipe object가 아니라 page reference count로 판단한다. `pageref(fd)`와 `pageref(pipe)`를 비교하고, `env_runs`를 활용해 race를 줄이는 구조다.

### 9.6 shell 흐름

`user/sh.c`는 다음 기능을 구현한다.

- token parsing
- command argument 배열 구성
- `<` 입력 redirection
- `>` 출력 redirection
- `|` pipeline
- `spawn`으로 명령 실행
- `wait`로 child 종료 대기
- `close_all`로 child fd 정리

pipeline은 대략 이렇게 동작한다.

```text
cmd1 | cmd2
  -> pipe(p)
  -> fork()
       child/right side:
         dup(p[0], 0)
         close pipe ends
         parse and run cmd2
       parent/left side:
         dup(p[1], 1)
         close pipe ends
         spawn cmd1
         wait
```

## 10. 완성형 lab6 기준 파일 역할 사전

이 절은 lab6 tree에 존재하는 파일을 기준으로 “무슨 역할인지” 빠르게 찾기 위한 사전이다. 이전 lab에서 등장한 파일도 lab6에서는 더 확장된 상태다.

### 10.1 root

| 파일 | 역할 |
|---|---|
| `.gitignore` | build 산출물 제외 규칙. |
| `Makefile` | 전체 build orchestrator. `boot`, `drivers`, `init`, `lib`, `mm`, `user`, `fs`를 빌드하고 `gxemul/vmlinux`를 링크한다. `test`, `debug`, `clean` target 포함. |
| `include.mk` | compiler, assembler, linker, flags 공통 정의. |

### 10.2 boot

| 파일 | 역할 |
|---|---|
| `boot/Makefile` | `start.S`를 object로 빌드한다. |
| `boot/start.S` | kernel entry, CP0 초기화, exception vector, stack 설정, `main` 호출. lab3 이후 exception dispatch와 연결된다. |

### 10.3 drivers

| 파일 | 역할 |
|---|---|
| `drivers/Makefile` | 하위 driver build 호출. |
| `drivers/gxconsole/Makefile` | console driver build. |
| `drivers/gxconsole/console.c` | GXemul console MMIO 출력과 halt. kernel `printf`의 최종 출력 경로. |
| `drivers/gxconsole/dev_cons.h` | console MMIO base/offset 정의. |

### 10.4 include

| 파일 | 역할 |
|---|---|
| `include/args.h` | user program argument layout와 argument parsing에 쓰이는 구조/상수. |
| `include/asm-mips3k/asm.h`, `include/asm/asm.h` | assembly 함수 작성 macro, alignment, symbol helper. |
| `include/asm-mips3k/cp0regdef.h`, `include/asm/cp0regdef.h` | MIPS CP0 register 이름/번호 정의. |
| `include/asm-mips3k/regdef.h`, `include/asm/regdef.h` | MIPS 일반 register alias 정의. |
| `include/env.h` | `Env` PCB 정의. trapframe, id, status, page directory, IPC, pgfault, scheduler run count 포함. |
| `include/error.h` | `E_BAD_ENV`, `E_NO_MEM`, `E_IPC_NOT_RECV`, `E_NOT_FOUND` 등 error code. |
| `include/fs.h` | on-disk file system 구조와 FS request protocol. |
| `include/kclock.h` | timer/clock 초기화 선언. |
| `include/kerelf.h` | kernel/user ELF loading에 필요한 ELF 구조체. |
| `include/mmu.h` | MIPS address layout, page/PTE/PDE macro, user/kernel virtual memory boundary. |
| `include/pmap.h` | `struct Page`, page 변환 macro, page table API 선언. |
| `include/print.h`, `include/printf.h` | kernel/user printf engine 선언. |
| `include/queue.h` | linked list macro. `Env_list`, `Page_list`의 기반. |
| `include/sched.h` | scheduler 함수 선언. |
| `include/stackframe.h` | MIPS trapframe save/restore assembly macro. |
| `include/trap.h` | `Trapframe` 구조체와 exception 관련 정의. |
| `include/types.h` | `u_int`, `u_long`, `size_t` 등 기본 타입. |
| `include/unistd.h` | syscall 번호 정의. user wrapper와 kernel syscall table이 공유한다. |

### 10.5 init

| 파일 | 역할 |
|---|---|
| `init/Makefile` | kernel init object와 embedded user binary object를 빌드한다. |
| `init/main.c` | C kernel entry. `mips_init()` 호출. |
| `init/init.c` | memory/env/trap/clock 초기화와 최초 user env 생성. lab6에서는 `user_icode`, `fs_serv` 생성. |
| `init/code.c`, `init/code_a.c`, `init/code_b.c` | 초기 user binary를 C array로 포함하는 파일. lab별 테스트 user program에 따라 쓰임이 달라진다. |

### 10.6 lib

| 파일 | 역할 |
|---|---|
| `lib/Makefile` | kernel-side library object build. |
| `lib/env.c` | env allocation, page directory setup, ELF loading, env run/free/destroy. |
| `lib/env_asm.S` | address space switch와 trapframe restore. |
| `lib/genex.S` | exception handler assembly. interrupt, TLB refill, syscall, mod exception entry. |
| `lib/getc.S` | console input polling syscall/low-level helper. |
| `lib/kclock.c`, `lib/kclock_asm.S` | timer interrupt source 초기화. |
| `lib/kernel_elfloader.c` | kernel에서 ELF binary를 읽어 segment callback으로 넘기는 loader. |
| `lib/print.c` | format parser. |
| `lib/printf.c` | kernel printf wrapper. |
| `lib/sched.c` | runnable env scheduler. |
| `lib/syscall.S` | syscall exception dispatch assembly. |
| `lib/syscall_all.c` | kernel syscall implementation. memory/env/ipc/device syscall 포함. |
| `lib/traps.c` | exception vector 등록과 page fault upcall 처리. |

### 10.7 mm

| 파일 | 역할 |
|---|---|
| `mm/Makefile` | memory management object build. |
| `mm/pmap.c` | physical memory detect, boot allocator, page allocator, page table operations, TLB invalidation, pageout. |
| `mm/pmap.all` | pmap 관련 보조/백업성 파일. 핵심 build 대상은 `pmap.c`. |
| `mm/tlb_asm.S` | TLB entry invalidate. |

### 10.8 fs

| 파일 | 역할 |
|---|---|
| `fs/Makefile` | FS server executable과 `fs.img` 생성. lab6 command binary를 image에 포함한다. |
| `fs/bintoc` | binary를 C array/object로 변환하는 도구 산출물. |
| `fs/fs.c` | block cache, bitmap, file/directory operation, flush/remove. |
| `fs/fs.h` | FS server internal definitions. |
| `fs/fsformat` | host-side fs image formatter binary. |
| `fs/fsformat.c` | `fs.img` 생성 코드. file tree를 disk block layout으로 배치한다. |
| `fs/ide.c` | IDE sector read/write using device syscall. |
| `fs/ide_asm.S` | IDE/device access assembly helper. |
| `fs/motd`, `fs/newmotd` | file system image에 들어가는 테스트 파일. |
| `fs/serv.c` | FS server. IPC request dispatch. |
| `fs/test.c` | FS self-test. |
| `fs/view` | FS image inspection helper binary. |

### 10.9 readelf

| 파일 | 역할 |
|---|---|
| `readelf/Makefile` | host-side readelf build. |
| `readelf/kerelf.h` | readelf용 ELF 구조체. |
| `readelf/main.c` | 파일을 읽어 `readelf()` 호출. |
| `readelf/readelf.c` | ELF header/section/program header parsing 과제 코드. |
| `readelf/testELF` | 테스트용 ELF binary. |
| `readelf/types.h` | readelf 도구용 기본 타입. |

### 10.10 tools와 gxemul

| 파일 | 역할 |
|---|---|
| `tools/scse0_3.lds` | kernel link script. section과 주소 배치를 결정한다. |
| `tools/fsformat` | fs image format 도구 산출물. |
| `gxemul/r3000`, `gxemul/r3000_test`, `gxemul/run.bash` | GXemul 실행 wrapper. |
| `gxemul/elfinfo`, `gxemul/fsformat`, `gxemul/view` | 보조 binary 산출물. |
| `gxemul/test`, `gxemul/vm.dump` | 테스트/덤프 산출물. |

### 10.11 user runtime과 syscall

| 파일 | 역할 |
|---|---|
| `user/Makefile` | user program과 user library build. `.b`/`.x` binary 생성. |
| `user/entry.S` | user program entry. `libmain()` 호출과 pgfault assembly trampoline. |
| `user/lib.h` | user library public API. syscall, IPC, fd, file, pipe, spawn, wait 선언. |
| `user/libos.c` | user process 공통 시작/종료 처리. |
| `user/syscall_wrap.S` | `msyscall` assembly wrapper. |
| `user/syscall_lib.c` | user syscall wrapper 함수. |
| `user/print.c`, `user/printf.c` | user-space printf/writef implementation. |
| `user/string.c` | user-space string/memory helper. |
| `user/pageref.c` | `vpt`를 이용해 page reference count를 읽는 helper. |
| `user/pgfault.c` | user pgfault handler 등록. |
| `user/fork.c` | COW fork와 PTE_LIBRARY 공유 처리. |
| `user/ipc.c` | IPC send/recv wrapper. |
| `user/wait.c` | child env 종료 대기 helper. |

### 10.12 user fd, file, pipe, console

| 파일 | 역할 |
|---|---|
| `user/fd.h` | `Fd`, `Dev`, `Stat`, fd address layout 정의. |
| `user/fd.c` | fd allocation, lookup, close, read/write dispatch, dup, stat. |
| `user/file.c` | file device implementation. open/read_map/read/write/truncate/remove/sync. |
| `user/fsipc.c` | FS server IPC request wrapper. |
| `user/pipe.c` | pipe device. shared ring buffer, read/write, close detection. |
| `user/console.c` | console device. open/read/write/iscons. |
| `user/fprintf.c` | fd로 format output을 쓰는 `fwritef`. |
| `user/dev_printf.c` | device/console 출력 보조. lab5 이후 변형에서 중요. |

### 10.13 user bootstrap, shell, commands

| 파일 | 역할 |
|---|---|
| `user/icode.c` | 최초 user program. `/motd` 출력 후 `init.b` spawn. |
| `user/init.c` | user init. console fd 설정 후 shell 반복 실행. |
| `user/sh.c` | shell parser/executor. redirection, pipe, spawn, wait. |
| `user/spawn.c` | user-level ELF loader. executable file을 새 env에 적재. |
| `user/cat.c` | file 내용을 stdout으로 출력. |
| `user/ls.c` | directory/file listing. |
| `user/echo.c` | arguments를 stdout에 출력. |
| `user/num.c` | 숫자/테스트용 command. |

### 10.14 user tests와 실험 파일

| 파일 | 역할 |
|---|---|
| `user/fktest.c` | fork 테스트. |
| `user/fstest.c` | file system user API 테스트. |
| `user/pingpong.c`, `pingpong_a.c`, `pingpong_b.c` | IPC ping-pong 테스트. |
| `user/testarg.c` | spawn argument 전달 테스트. |
| `user/testbss.c` | ELF bss zeroing 테스트. |
| `user/testfdsharing.c` | fork/spawn 이후 fd 공유 테스트. |
| `user/testpipe.c` | pipe 기본 read/write 테스트. |
| `user/testpiperace.c` | pipe close/refcount race 테스트. |
| `user/testptelibrary.c` | `PTE_LIBRARY` 공유 page 동작 테스트. |
| `user/try*.c` | lab별 임시/수동 실험 프로그램. |
| `user/out.txt` | 테스트 출력/데이터 파일. |
| `user/<` | 이름이 특이한 테스트/실험 파일. shell redirection 문자와 관련된 실험 흔적으로 보인다. |
| `user/bintoc` | user binary embedding helper 산출물. |
| `user/user.lds` | user program link script. |

## 11. branch 변형 전체 요약

| 계열 | 핵심 의미 |
|---|---|
| `lab0-Extra` | 소스/헤더 분리, multi-stage Makefile |
| `lab0-exam` | `find`, `grep` shell script 시험 |
| `lab1-1-Extra` | ELF endian handling |
| `lab1-1-exam` | program header offset 출력 |
| `lab1-2-Extra` | MIPS assembly calculator |
| `lab1-2-exam` | printf 배열 format |
| `lab2-1-Extra` | allocator/free list 변형 |
| `lab2-1-exam` | page 상태 조회 |
| `lab2-2-Extra` | page table address 계산/self mapping |
| `lab2-2-exam` | mapping된 page count |
| `lab3-1-Extra` | env root/process tree 관련 함수 |
| `lab3-1-exam` | priority 포함 envid |
| `lab3-2-Extra` | overflow exception 처리 |
| `lab3-2-exam` | priority budget scheduler |
| `lab4-1-Extra` | IPC/스케줄링 관찰 |
| `lab4-1-exam` | syscall ABI/varargs |
| `lab4-2-Extra` | page fault/COW instrumentation |
| `lab4-2-exam` | `tfork()` thread-like fork |
| `lab5-1-Extra` | console interrupt/kcons scaffold |
| `lab5-1-exam` | user-level console MMIO |
| `lab5-2-Extra` | symbolic link |
| `lab5-2-exam` | file checksum metadata |
| `lab6` | shell, spawn, fd, pipe까지 통합 |
| `*-result` | 대부분 채점 로그. 실제 소스 분석보다는 제출 결과 확인용 |

## 12. 읽는 순서 추천

처음부터 모든 파일을 펼치면 길을 잃기 쉽다. 아래 순서로 읽으면 OS가 단계적으로 보인다.

1. `boot/start.S`, `tools/scse0_3.lds`, `init/main.c`
2. `lib/printf.c`, `lib/print.c`, `drivers/gxconsole/console.c`
3. `include/mmu.h`, `include/pmap.h`, `mm/pmap.c`
4. `include/env.h`, `lib/env.c`, `lib/env_asm.S`
5. `lib/genex.S`, `lib/traps.c`, `lib/syscall.S`, `lib/syscall_all.c`
6. `user/syscall_wrap.S`, `user/syscall_lib.c`, `user/entry.S`
7. `user/fork.c`, `user/pgfault.c`, `user/ipc.c`
8. `include/fs.h`, `fs/fs.c`, `fs/ide.c`, `fs/serv.c`
9. `user/fd.h`, `user/fd.c`, `user/file.c`, `user/fsipc.c`
10. `user/spawn.c`, `user/pipe.c`, `user/sh.c`

핵심 관점은 하나다. 이 코드는 “커널이 다 해주는 OS”가 아니라, kernel이 아주 작은 primitive를 만들고 user space가 그것을 조립해 `fork`, `IPC`, `file`, `pipe`, `shell`을 완성하는 교육용 MIPS OS다.
