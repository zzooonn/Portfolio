/* Explain the close-order race without running an OS or scheduling real work. */
(() => {
  const root = document.querySelector('[data-pipe-demo]');
  if (!root) return;

  const copy = {
    ko: {
      eyebrow: '10초 데모 · PIPE',
      title: '닫는 순서만 바꿔보세요',
      intro: '읽기 연결 3개, 쓰기 연결 1개. 읽기 연결 하나만 닫고, writer는 계속 열어둡니다.',
      modesLabel: 'close 순서 선택',
      unsafe: '수정 전 · 데이터 먼저',
      safe: '수정 후 · fd 먼저',
      fdLabel: '읽기 fd 참조',
      refLabel: '공용 데이터 참조',
      writerLabel: '열린 쓰기 연결',
      stepLabel: '단계',
      next: '다음 단계 →',
      done: '완료',
      reset: '처음으로',
      note: '빈 버퍼에서 읽는 상황을 단순화한 개념 데모입니다. 실제 OS를 실행하지 않습니다.',
      ready: 'writer가 열려 있습니다',
      danger: '거짓 EOF · writer는 열려 있음',
      valid: '정상 판정 · writer는 열려 있음',
      finished: '닫기 완료 · writer는 열려 있음',
      start: 'fd_ref는 읽기 fd 페이지의 참조 수, pipe_ref는 읽기·쓰기가 함께 쓰는 데이터 페이지의 참조 수입니다. 다음 단계에서 첫 매핑을 해제합니다.',
      unsafeStep: '공용 데이터 매핑부터 해제해 pipe_ref만 4 → 3이 됐습니다. 여기서 다른 reader가 검사하면 3 = 3을 보고, 살아 있는 writer를 닫혔다고 오판합니다.',
      safeStep: '읽기 fd 매핑부터 해제해 fd_ref만 3 → 2가 됐습니다. 여기서 다른 reader가 검사해도 2 < 4이므로 writer가 닫혔다고 오판하지 않습니다.',
      end: '남은 매핑도 해제했습니다. 읽기 연결은 2개, 쓰기 연결은 1개입니다. 두 순서의 최종값은 같습니다. 차이는 1단계 직후 다른 reader가 보는 값입니다.'
    },
    en: {
      eyebrow: '10-SECOND DEMO · PIPE',
      title: 'Change only the close order',
      intro: 'Three read connections and one write connection. Close one read connection while the writer stays open.',
      modesLabel: 'Choose the close order',
      unsafe: 'Before · data first',
      safe: 'After · fd first',
      fdLabel: 'Read-fd references',
      refLabel: 'Shared-data references',
      writerLabel: 'Open write connections',
      stepLabel: 'Step',
      next: 'Next step →',
      done: 'Done',
      reset: 'Reset',
      note: 'A simplified concept demo with an empty buffer. It does not run the actual OS.',
      ready: 'The writer is open',
      danger: 'False EOF · writer still open',
      valid: 'Correct check · writer still open',
      finished: 'Close complete · writer still open',
      start: 'fd_ref counts references to the read-fd page. pipe_ref counts references to the data page shared by readers and writers. Next, unmap the first page.',
      unsafeStep: 'Unmapping shared data first changes only pipe_ref: 4 → 3. If another reader checks now, 3 = 3 falsely suggests that the live writer has closed.',
      safeStep: 'Unmapping the read fd first changes only fd_ref: 3 → 2. Another reader still sees 2 < 4, so it does not mistake the writer for closed.',
      end: 'The remaining mapping is removed. Two read connections and one write connection remain. Both orders end with the same counts; the difference is what another reader sees after step 1.'
    },
    zh: {
      eyebrow: '10秒演示 · PIPE',
      title: '只改变关闭顺序',
      intro: '三个读连接、一个写连接。只关闭其中一个读连接，writer 始终保持打开。',
      modesLabel: '选择关闭顺序',
      unsafe: '修改前 · 先解除数据映射',
      safe: '修改后 · 先解除 fd 映射',
      fdLabel: '读 fd 引用数',
      refLabel: '共享数据引用数',
      writerLabel: '打开的写连接',
      stepLabel: '步骤',
      next: '下一步 →',
      done: '完成',
      reset: '重置',
      note: '这是缓冲区为空时的简化概念演示，不执行实际操作系统。',
      ready: 'writer 保持打开',
      danger: '误判 EOF · writer 仍然打开',
      valid: '正确判断 · writer 仍然打开',
      finished: '关闭完成 · writer 仍然打开',
      start: 'fd_ref 是读 fd 页的引用数，pipe_ref 是读写两端共享的数据页引用数。下一步先解除一个映射。',
      unsafeStep: '先解除共享数据映射，只有 pipe_ref 从 4 → 3。若另一个 reader 此时检查，就会因为 3 = 3 而误判仍存活的 writer 已关闭。',
      safeStep: '先解除读 fd 映射，只有 fd_ref 从 3 → 2。另一个 reader 此时仍看到 2 < 4，因此不会误判 writer 已关闭。',
      end: '另一个映射也已解除，剩余两个读连接、一个写连接。两种顺序的最终计数相同，区别在于第一步后其他 reader 看到的中间状态。'
    }
  };

  const query = selector => root.querySelector(selector);
  const modes = [...root.querySelectorAll('[data-pipe-mode]')];
  const next = query('[data-pipe-next]');
  let mode = 'unsafe';
  let step = 0;

  function render() {
    const lang = document.documentElement.lang;
    const text = copy[lang.startsWith('zh') ? 'zh' : lang.startsWith('en') ? 'en' : 'ko'];
    const fd = 3 - Number(step === 2 || (step === 1 && mode === 'safe'));
    const pipe = 4 - Number(step === 2 || (step === 1 && mode === 'unsafe'));
    const danger = step === 1 && mode === 'unsafe';

    root.querySelectorAll('[data-pipe-copy]').forEach(element => {
      element.textContent = text[element.dataset.pipeCopy];
    });
    query('[data-pipe-group]').setAttribute('aria-label', text.modesLabel);
    modes.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pipeMode === mode)));
    query('[data-pipe-fd]').textContent = fd;
    query('[data-pipe-ref]').textContent = pipe;
    query('[data-pipe-fd]').parentElement.classList.toggle('is-changed', fd !== 3);
    query('[data-pipe-ref]').parentElement.classList.toggle('is-changed', pipe !== 4);
    query('[data-pipe-equation]').textContent = `${fd} ${fd === pipe ? '=' : '<'} ${pipe}`;
    query('[data-pipe-verdict]').textContent = text[step === 0 ? 'ready' : danger ? 'danger' : step === 2 ? 'finished' : 'valid'];
    query('[data-pipe-message]').textContent = text[step === 0 ? 'start' : step === 2 ? 'end' : mode === 'unsafe' ? 'unsafeStep' : 'safeStep'];
    query('[data-pipe-progress]').textContent = `${step} / 2`;
    next.textContent = text[step === 2 ? 'done' : 'next'];
    next.disabled = step === 2;
    root.dataset.state = step === 0 ? 'ready' : danger ? 'danger' : 'safe';
  }

  modes.forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.pipeMode;
    step = 0;
    render();
  }));
  next.addEventListener('click', () => {
    step = Math.min(step + 1, 2);
    render();
  });
  query('[data-pipe-reset]').addEventListener('click', () => {
    step = 0;
    render();
  });
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  render();
})();
