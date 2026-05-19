# Portfolio index.html 종합 수정 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `index.html`의 성능·접근성·보안·코드 품질 문제(Have_To_Fix.md 전체 + 추가 발굴 ARIA·테마 색상 문제)를 수정하고 favicon.svg를 신규 생성한다.

**Architecture:** 단일 파일 프로젝트. CSS·HTML·JS 모두 `index.html` 안에 있으므로 모든 편집이 한 파일에 집중된다. 논리적으로 연관된 변경을 태스크 단위로 묶어 커밋한다. `favicon.svg`만 신규 파일로 생성된다.

**Tech Stack:** HTML5, CSS3, Vanilla JS, SVG — 빌드 도구 없음

**Out of scope:** 인라인 스타일 유틸리티 클래스 추출(Have_To_Fix #9) — 전체 HTML 리팩토링이 필요해 범위가 지나치게 크므로 별도 작업으로 분리한다.

---

### Task 1: `<head>` 개선 — @import 통합, preconnect, OG 태그, favicon, color-scheme

**Files:**
- Modify: `index.html:4-12`

- [ ] **Step 1: preconnect 3개 추가 + @import 3개 → 1개 통합**

현재 `index.html`의 8~12번 줄:
```html
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/devicon.min.css" />
    <style>
      @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap");
      @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Noto+Sans+KR:wght@300;400;500;700;900&family=Noto+Sans+SC:wght@400;700;900&display=swap");
      @import url("https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700;900&display=swap");
```

다음으로 교체한다:
```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://cdn.jsdelivr.net">
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/devicon.min.css" />
    <style>
      @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Noto+Sans+KR:wght@300;400;500;700;900&family=Noto+Sans+SC:wght@400;700;900&family=Noto+Serif+KR:wght@500;700;900&display=swap");
```

- [ ] **Step 2: favicon, OG 태그, color-scheme 추가**

`<meta name="description" ...>` 줄(line 7) 바로 뒤에 삽입한다:
```html
    <link rel="icon" type="image/svg+xml" href="favicon.svg">
    <link rel="apple-touch-icon" href="apple-touch-icon.png">
    <meta name="color-scheme" content="light">
    <meta property="og:type" content="website">
    <meta property="og:title" content="조현준 | Systems &amp; AI Full-Stack Engineer">
    <meta property="og:description" content="OS 커널, 컴파일러, AI 모델 설계부터 풀스택 서비스까지. BUAA 소프트웨어공학 졸업생.">
    <meta property="og:url" content="">
    <meta property="og:image" content="">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="조현준 | Systems &amp; AI Full-Stack Engineer">
    <meta name="twitter:description" content="OS 커널, 컴파일러, AI 모델 설계부터 풀스택 서비스까지.">
```

(og:url과 og:image는 GitHub Pages 배포 URL 확정 후 채운다)

- [ ] **Step 3: 브라우저 확인**

`index.html`을 브라우저로 열고 DevTools > Network에서 `fonts.googleapis.com` 요청이 1회인지 확인한다. 폰트·아이콘이 정상 로드되어야 한다.

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "perf: consolidate Google Fonts @import 3→1, add preconnect, OG meta, favicon link"
```

---

### Task 2: 중복 `:root` 블록 제거

**Files:**
- Modify: `index.html:13-21`

- [ ] **Step 1: 첫 번째 :root 블록 삭제**

`index.html` 13~21번 줄의 다음 블록을 통째로 삭제한다:
```css
      :root {
        --background: #f4f6fa; --foreground: #111827; --card: #ffffff; --surface-2: #f8faff;
        --primary: #5b58ff; --primary-deep: #3730a3; --accent-lt: #f5f3ff; --accent-dim: #ddd6fe;
        --border: #e2e8f0; --text-2: #334155; --text-3: #475569; --green: #10b981; --green-lt: #ecfdf5;
        --teal: #0ea5e9; --teal-lt: #ecfeff; --pink: #ec4899; --pink-lt: #fdf2f8; --amber: #f59e0b;
        --amber-lt: #fef3c7; --slate: #64748b; --slate-lt: #f1f5f9; --code-bg: #1e2430;
        --shadow-sm: 0 10px 30px rgba(15,23,42,0.05); --shadow-md: 0 16px 40px rgba(15,23,42,0.08);
        --shadow-lg: 0 24px 60px rgba(15,23,42,0.1); --ease: cubic-bezier(0.16,1,0.3,1);
      }
```

이 블록은 line 322의 두 번째 `:root`가 모든 변수를 재정의하므로 CSS cascade에서 아무 효과가 없는 dead code다.

- [ ] **Step 2: 브라우저 확인**

새로 고침 후 스타일 변화가 없는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "style: remove dead first :root block (fully overridden by second block at line 322)"
```

---

### Task 3: `@media print` PII 보안 수정

**Files:**
- Modify: `index.html:1147` (압축된 `@media print` 블록)

- [ ] **Step 1: 수정 대상 확인**

`index.html` 1147번 줄에서 `.pii,.pii-img{filter:none!important}` 패턴을 찾는다.

- [ ] **Step 2: selector 범위 좁히기**

`.pii,.pii-img{filter:none!important}` 를 아래로 교체한다:

```
body.pii-off .pii,body.pii-off .pii-img{filter:none!important}
```

이렇게 하면 사용자가 명시적으로 블러를 해제(`body.pii-off` 클래스 존재)한 경우에만 인쇄 시 PII가 선명하게 나온다. 블러 켜짐 기본 상태에서 인쇄하면 여전히 흐릿하게 출력된다.

- [ ] **Step 3: 동작 확인**

브라우저에서 `Ctrl+P`로 인쇄 미리보기를 연다:
- 블러 켜짐(기본) 상태 → 사진·연락처가 블러 처리된 채로 미리보기에 표시되어야 함
- 블러 해제 후 인쇄 → 선명하게 표시되어야 함

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "fix(privacy): restrict print PII unblur to explicit pii-off state only"
```

---

### Task 4: `onclick="return false;"` → `aria-disabled="true"`

**Files:**
- Modify: `index.html` (CSS 1곳 + `<a>` 태그 5곳)

- [ ] **Step 1: CSS 규칙 추가**

`a { color: inherit; text-decoration: none; }` 줄(line 24) 바로 다음에 삽입한다:

```css
      a[aria-disabled="true"] { cursor: not-allowed; pointer-events: none; opacity: .55; }
```

- [ ] **Step 2: nav GitHub 버튼 수정 (line 1171)**

```html
<!-- 수정 전 -->
<a class="button dark" href="#" onclick="return false;" title="개인정보 보호를 위해 비활성화됨">

<!-- 수정 후 -->
<a class="button dark" aria-disabled="true" title="개인정보 보호를 위해 비활성화됨">
```

- [ ] **Step 3: drawer GitHub 버튼 수정 (line 1188)**

```html
<!-- 수정 전 -->
<a class="button dark" href="#" onclick="return false;" style="flex:1">GitHub</a>

<!-- 수정 후 -->
<a class="button dark" aria-disabled="true" style="flex:1">GitHub</a>
```

- [ ] **Step 4: hero 연락하기 버튼 수정 (line 1223)**

```html
<!-- 수정 전 -->
<a class="button" href="#" onclick="return false;" title="개인정보 보호를 위해 비활성화됨" data-i18n="hero.cta.contact">연락하기</a>

<!-- 수정 후 -->
<a class="button" aria-disabled="true" title="개인정보 보호를 위해 비활성화됨" data-i18n="hero.cta.contact">연락하기</a>
```

- [ ] **Step 5: footer 메일 아이콘 수정 (line 1902)**

```html
<!-- 수정 전 -->
<a class="icon-link" href="#" onclick="return false;" title="개인정보 보호를 위해 비활성화됨" aria-label="메일 비활성화">✉</a>

<!-- 수정 후 -->
<a class="icon-link" aria-disabled="true" title="개인정보 보호를 위해 비활성화됨" aria-label="메일 비활성화">✉</a>
```

- [ ] **Step 6: footer GitHub 아이콘 수정 (line 1903)**

```html
<!-- 수정 전 -->
<a class="icon-link" href="#" onclick="return false;" title="개인정보 보호를 위해 비활성화됨" aria-label="GitHub 비활성화"><svg ...></svg></a>

<!-- 수정 후 -->
<a class="icon-link" aria-disabled="true" title="개인정보 보호를 위해 비활성화됨" aria-label="GitHub 비활성화"><svg ...></svg></a>
```

- [ ] **Step 7: 동작 확인**

브라우저에서:
- GitHub·연락하기 버튼 클릭 시 URL이 `#`으로 변하지 않아야 함
- 커서가 `not-allowed`로 표시되어야 함
- 버튼 opacity가 약 55%여야 함

- [ ] **Step 8: 커밋**

```bash
git add index.html
git commit -m "fix(a11y): replace href=#/onclick=return false with aria-disabled on inactive links"
```

---

### Task 5: ARIA 접근성 — aria-expanded, aria-pressed, aria-hidden, heading 계층

**Files:**
- Modify: `index.html` (HTML + JS)

- [ ] **Step 1: `nav-hamburger` — `aria-expanded` 초기값 추가 (HTML)**

Line 1175를 수정한다:

```html
<!-- 수정 전 -->
<button class="nav-hamburger" id="nav-hamburger" aria-label="메뉴 열기"><span></span><span></span><span></span></button>

<!-- 수정 후 -->
<button class="nav-hamburger" id="nav-hamburger" aria-label="메뉴 열기" aria-expanded="false"><span></span><span></span><span></span></button>
```

- [ ] **Step 2: `nav-hamburger` — click 핸들러에 aria-expanded 업데이트 추가 (JS)**

Line 2443의 hamburger click 핸들러를 수정한다:

```js
// 수정 전 (압축된 형태)
hamburger.addEventListener('click',()=>{drawerOpen=!drawerOpen;hamburger.classList.toggle('open',drawerOpen);drawer.classList.toggle('open',drawerOpen);hamburger.setAttribute('aria-label',drawerOpen?'메뉴 닫기':'메뉴 열기');});

// 수정 후
hamburger.addEventListener('click',()=>{drawerOpen=!drawerOpen;hamburger.classList.toggle('open',drawerOpen);drawer.classList.toggle('open',drawerOpen);hamburger.setAttribute('aria-label',drawerOpen?'메뉴 닫기':'메뉴 열기');hamburger.setAttribute('aria-expanded',String(drawerOpen));});
```

- [ ] **Step 3: `blur-toggle-bar` — `aria-pressed` 초기값 추가 (HTML)**

Line 1917을 수정한다 (초기 상태가 블러 ON = pressed):

```html
<!-- 수정 전 -->
<button class="blur-toggle-bar" id="blur-toggle" type="button" data-i18n="blur.on">

<!-- 수정 후 -->
<button class="blur-toggle-bar" id="blur-toggle" type="button" aria-pressed="true" data-i18n="blur.on">
```

- [ ] **Step 4: `blur-toggle-bar` — 클릭 핸들러에 aria-pressed 업데이트 추가 (JS)**

Line 2465의 블러 토글 핸들러를 수정한다:

```js
// 수정 전 (압축된 형태)
if(blurToggle){blurToggle.addEventListener('click',()=>{document.body.classList.toggle('pii-off');const key=document.body.classList.contains('pii-off')?'blur.off':'blur.on';blurToggle.textContent=TRANSLATIONS[currentLang][key];blurToggle.dataset.i18n=key;});}

// 수정 후
if(blurToggle){blurToggle.addEventListener('click',()=>{document.body.classList.toggle('pii-off');const isBlurOn=!document.body.classList.contains('pii-off');blurToggle.setAttribute('aria-pressed',String(isBlurOn));const key=document.body.classList.contains('pii-off')?'blur.off':'blur.on';blurToggle.textContent=TRANSLATIONS[currentLang][key];blurToggle.dataset.i18n=key;});}
```

- [ ] **Step 5: `lang-switcher` — role, aria-label, aria-pressed 추가 (HTML)**

Lines 1910-1914를 수정한다:

```html
<!-- 수정 전 -->
<div class="lang-switcher" id="lang-switcher">
  <button class="lang-btn active" data-lang="ko" type="button">한</button>
  <button class="lang-btn" data-lang="en" type="button">EN</button>
  <button class="lang-btn" data-lang="zh" type="button">中</button>
</div>

<!-- 수정 후 -->
<div class="lang-switcher" id="lang-switcher" role="group" aria-label="언어 선택">
  <button class="lang-btn active" data-lang="ko" type="button" aria-pressed="true">한</button>
  <button class="lang-btn" data-lang="en" type="button" aria-pressed="false">EN</button>
  <button class="lang-btn" data-lang="zh" type="button" aria-pressed="false">中</button>
</div>
```

- [ ] **Step 6: `lang-switcher` — applyLang에 aria-pressed 동기화 추가 (JS)**

Line 2390-2392의 lang-btn 업데이트 부분을 수정한다:

```js
// 수정 전
document.querySelectorAll('.lang-btn').forEach(b =>
  b.classList.toggle('active', b.dataset.lang === lang)
);

// 수정 후
document.querySelectorAll('.lang-btn').forEach(b => {
  b.classList.toggle('active', b.dataset.lang === lang);
  b.setAttribute('aria-pressed', b.dataset.lang === lang ? 'true' : 'false');
});
```

- [ ] **Step 7: 장식 요소 aria-hidden 추가 (HTML)**

3개 요소에 `aria-hidden="true"` 추가:

```html
<!-- line 1192 — scroll-progress -->
<div class="scroll-progress" aria-hidden="true"><div class="scroll-progress-bar" id="scroll-bar"></div></div>

<!-- line 1196 — hero-bg -->
<div class="hero-bg" aria-hidden="true">

<!-- line 1201 — hero-dots -->
<div class="hero-dots" aria-hidden="true">
```

- [ ] **Step 8: hero card `<h2>` → `<div>` (HTML)**

Line 1232를 수정한다 (CSS 스타일은 `hero-card-title` 클래스로 유지됨):

```html
<!-- 수정 전 -->
<h2 class="hero-card-title">조현준</h2>

<!-- 수정 후 -->
<div class="hero-card-title">조현준</div>
```

- [ ] **Step 9: 확인**

브라우저 DevTools Accessibility 탭에서:
- 햄버거 버튼의 `aria-expanded`가 메뉴 열림/닫힘 시 변하는지 확인
- 블러 토글 버튼의 `aria-pressed`가 클릭 시 반전되는지 확인
- 언어 버튼의 `aria-pressed`가 전환 시 업데이트되는지 확인

- [ ] **Step 10: 커밋**

```bash
git add index.html
git commit -m "fix(a11y): add aria-expanded/pressed, aria-hidden on decorative elements, fix heading hierarchy"
```

---

### Task 6: CSS purple 테마 잔재 → teal 정리

**Files:**
- Modify: `index.html` (CSS 섹션, lines 55–290)

현재 primary 테마 값: `--primary: #1d6f73`, `--primary-deep: #0f4345`

디자인 리프레시 블록(line 321+)이 override하지 않은 purple 하드코딩 값만 대상으로 한다.

- [ ] **Step 1: brand-mark box-shadow 수정 (line 83)**

```css
/* 수정 전 */
box-shadow: 0 6px 16px rgba(91,88,255,.28);

/* 수정 후 */
box-shadow: 0 6px 16px rgba(29,111,115,.25);
```

- [ ] **Step 2: footer-brand-mark box-shadow 수정 (line 261)**

```css
/* 수정 전 */
box-shadow: 0 14px 30px rgba(91,88,255,.18);

/* 수정 후 */
box-shadow: 0 14px 30px rgba(29,111,115,.18);
```

- [ ] **Step 3: scroll-progress-bar 그라디언트 끝 색 수정 (line 286)**

```css
/* 수정 전 */
background:linear-gradient(90deg,var(--primary),#a78bfa);

/* 수정 후 */
background:linear-gradient(90deg,var(--primary),#4aacb0);
```

- [ ] **Step 4: button.primary box-shadow 수정 (line 94)**

```css
/* 수정 전 */
box-shadow: 0 14px 30px rgba(91,88,255,.22);

/* 수정 후 */
box-shadow: 0 14px 30px rgba(29,111,115,.22);
```

- [ ] **Step 5: button.primary:hover 색상 수정 (line 95)**

```css
/* 수정 전 */
.button.primary:hover { color: #fff; background: #4f46e5; border-color: #4f46e5; box-shadow: 0 18px 36px rgba(91,88,255,.32); }

/* 수정 후 */
.button.primary:hover { color: #fff; background: var(--primary-deep); border-color: var(--primary-deep); box-shadow: 0 18px 36px rgba(29,111,115,.32); }
```

- [ ] **Step 6: button.dark:hover box-shadow 수정 (line 97)**

```css
/* 수정 전 */
box-shadow: 0 10px 24px rgba(91,88,255,.25);

/* 수정 후 */
box-shadow: 0 10px 24px rgba(29,111,115,.25);
```

- [ ] **Step 7: hero-card pseudo-elements 수정 (lines 140, 142)**

```css
/* line 140 수정 전 */
background: radial-gradient(circle,rgba(91,88,255,.1),transparent 70%);
/* 수정 후 */
background: radial-gradient(circle,rgba(29,111,115,.1),transparent 70%);

/* line 142 수정 전 */
background: linear-gradient(90deg,transparent,rgba(91,88,255,.2),transparent);
/* 수정 후 */
background: linear-gradient(90deg,transparent,rgba(29,111,115,.2),transparent);
```

- [ ] **Step 8: hero-card-mark 수정 (line 143)**

```css
/* 수정 전 */
background: linear-gradient(135deg,var(--accent-lt),#ddd6fe); box-shadow: 0 14px 30px rgba(91,88,255,.16);

/* 수정 후 */
background: linear-gradient(135deg,var(--accent-lt),var(--accent-dim)); box-shadow: 0 14px 30px rgba(29,111,115,.16);
```

- [ ] **Step 9: hero-orb.primary 수정 (line 115)**

```css
/* 수정 전 */
background: radial-gradient(circle,rgba(91,88,255,.06),transparent 60%);

/* 수정 후 */
background: radial-gradient(circle,rgba(29,111,115,.06),transparent 60%);
```

- [ ] **Step 10: badge-primary box-shadow 수정 (line 241)**

```css
/* 수정 전 */
box-shadow: 0 10px 22px rgba(91,88,255,.18);

/* 수정 후 */
box-shadow: 0 10px 22px rgba(29,111,115,.18);
```

- [ ] **Step 11: troubleshoot 테두리/배경 수정 (lines 237, 239)**

```css
/* line 237 수정 전 */
border: 1px solid #dde3ff; ... background: linear-gradient(135deg,#fafbff,#f5f7ff);
/* 수정 후 */
border: 1px solid var(--border); ... background: linear-gradient(135deg,var(--card),var(--surface-2));

/* line 239 수정 전 */
border-bottom: 1px solid #dde3ff;
/* 수정 후 */
border-bottom: 1px solid var(--border);
```

- [ ] **Step 12: footer::before 수정 (line 258)**

```css
/* 수정 전 */
background: linear-gradient(90deg,transparent,rgba(91,88,255,.2),transparent);

/* 수정 후 */
background: linear-gradient(90deg,transparent,rgba(29,111,115,.2),transparent);
```

- [ ] **Step 13: 시각 확인**

브라우저에서 스크롤 진행 바, 브랜드 마크, hero card 테두리 등이 보라색이 아닌 teal 계열로 표시되는지 확인한다.

- [ ] **Step 14: 커밋**

```bash
git add index.html
git commit -m "style: replace hardcoded purple CSS values with teal theme colors"
```

---

### Task 7: `.stats-grid` dead CSS/JS 제거

**Files:**
- Modify: `index.html` (CSS 6곳 + JS 1곳)

HTML에 `class="stats-grid"` 요소가 존재하지 않으므로 CSS/JS 모두 dead code다.

- [ ] **Step 1: 일반 CSS 규칙 제거 (line 156)**

```css
/* 삭제 대상 */
.stats-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: .9rem; margin-top: -2rem; }
```

- [ ] **Step 2: 압축 미디어쿼리에서 stats-grid 제거 (lines 279, 282)**

Line 279에서 `.stats-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:0}` 부분만 삭제한다.
Line 282에서 `.stats-grid{grid-template-columns:1fr}` 부분만 삭제한다.

- [ ] **Step 3: 디자인 리프레시 블록의 stats-grid 규칙 제거 (lines 672–680)**

```css
/* 삭제 대상 */
      .stats-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 1px;
        margin-top: 0;
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: hidden;
        background: var(--border);
      }
```

- [ ] **Step 4: 반응형 CSS에서 stats-grid 제거 (lines 1083, 1107)**

Line 1083에서 `.stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }` 삭제.
Line 1107에서 `.stats-grid { grid-template-columns: 1fr; }` 삭제.

- [ ] **Step 5: @media print 블록에서 stats-grid 제거 (line 1147)**

1147번 줄(압축 @media print)에서 stats-grid가 포함된 3개 패턴을 수정한다:
- `.stats-grid{grid-template-columns:repeat(2,1fr)!important;margin-top:0}` 삭제
- `.panel-grid-2,.about-grid,.skill-grid,.stats-grid{break-inside:auto;...}` → `.panel-grid-2,.about-grid,.skill-grid{break-inside:auto;...}`
- `.panel-grid-2 > *,.about-grid > *,.skill-grid > *,.stats-grid > *{break-inside:avoid;...}` → `.panel-grid-2 > *,.about-grid > *,.skill-grid > *{break-inside:avoid;...}`

- [ ] **Step 6: JS 쿼리에서 stats-grid 제거 (line 2434)**

```js
// 수정 전
document.querySelectorAll('.stats-grid,.hero-mini-grid,.skill-summary').forEach(el=>counterObserver.observe(el));

// 수정 후
document.querySelectorAll('.hero-mini-grid,.skill-summary').forEach(el=>counterObserver.observe(el));
```

- [ ] **Step 7: 확인**

```bash
grep -n "stats-grid" index.html
```

결과가 없어야 한다.

- [ ] **Step 8: 커밋**

```bash
git add index.html
git commit -m "chore: remove .stats-grid dead CSS and JS (no HTML elements with this class)"
```

---

### Task 8: favicon.svg 생성

**Files:**
- Create: `favicon.svg`

- [ ] **Step 1: favicon.svg 생성**

브랜드 초성 "조"를 teal 배경에 그린 SVG:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#1d6f73"/>
  <text x="16" y="23" text-anchor="middle" font-family="'Noto Serif KR', 'Noto Sans KR', sans-serif" font-size="20" font-weight="900" fill="#f6f7f4">조</text>
</svg>
```

- [ ] **Step 2: 브라우저 확인**

`index.html`을 브라우저로 열어 탭에 teal 배경의 "조" 아이콘이 표시되는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add favicon.svg
git commit -m "feat: add favicon.svg with teal background brand initial"
```

---

### Task 9: Project 03 SVG 아키텍처 다이어그램 — Docker Compose 색상 수정

**Files:**
- Modify: `index.html:1560-1562` (SVG 내 Docker Compose border + label)

Spring Boot(blue), PostgreSQL(green) 등 기술별 의미론적 색상은 유지하고, 페이지 테마와 관계없는 Docker Compose 그룹 경계선과 레이블만 purple(`#5b58ff`)에서 teal로 수정한다.

- [ ] **Step 1: Docker Compose 경계선 색상 수정 (line 1560)**

```html
<!-- 수정 전 -->
<rect x="8" y="260" ... stroke="#5b58ff" ...></rect>

<!-- 수정 후 -->
<rect x="8" y="260" ... stroke="#1d6f73" ...></rect>
```

- [ ] **Step 2: Docker Compose 레이블 색상 수정 (lines 1561-1562)**

```html
<!-- 수정 전 -->
<rect x="18" y="248" ... fill="#f0f0ff"></rect>
<text ... fill="#5b58ff" ...>Docker Compose 환경</text>

<!-- 수정 후 -->
<rect x="18" y="248" ... fill="#e3eeeb"></rect>
<text ... fill="#1d6f73" ...>Docker Compose 환경</text>
```

- [ ] **Step 3: 시각 확인**

Project 03 아코디언을 열어 아키텍처 다이어그램에서 Docker Compose 경계선과 레이블이 teal 색상으로 표시되는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "style: update Project03 SVG Docker Compose color from purple to teal theme"
```

---

## 자기 검토

**Spec coverage 확인:**
- Have_To_Fix.md #1 (fonts 통합) → Task 1 ✓
- Have_To_Fix.md #2 (중복 :root) → Task 2 ✓
- Have_To_Fix.md #3 (onclick 안티패턴) → Task 4 ✓
- Have_To_Fix.md #4 (print PII) → Task 3 ✓
- Have_To_Fix.md #5 (OG 태그) → Task 1 ✓
- Have_To_Fix.md #6 (favicon) → Task 1 + Task 8 ✓
- Have_To_Fix.md #7 (stats-grid dead code) → Task 7 ✓
- Have_To_Fix.md #8 (SVG 색상) → Task 9 ✓
- Have_To_Fix.md #9 (인라인 스타일) → Out of scope (별도 작업 필요)
- Have_To_Fix.md #10 (preconnect) → Task 1 ✓
- 신규 A (blur aria-pressed) → Task 5 ✓
- 신규 B (hamburger aria-expanded) → Task 5 ✓
- 신규 C (lang aria-pressed) → Task 5 ✓
- 신규 D (장식 요소 aria-hidden) → Task 5 ✓
- 신규 E (CSS purple 24곳) → Task 6 ✓
- 신규 F (h2 계층) → Task 5 ✓

**누락 없음.**
