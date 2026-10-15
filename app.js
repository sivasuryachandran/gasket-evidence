(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers
  // All dynamic text goes through textContent / setAttribute, never innerHTML: the data comes from GitLab.
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'class') el.className = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, kids) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(iso) {
    if (!iso) return 'not recorded';
    var d = new Date(iso);
    if (isNaN(d)) return 'not recorded';
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
  }
  function fmtShort(iso) { if (!iso) return 'not recorded'; var d = new Date(iso); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function fmtDay(iso) { return iso ? fmtTime(iso).split(',')[0] : 'not recorded'; }
  function num(v, d) { return v === null || v === undefined ? 'not recorded' : Number(v).toFixed(d === undefined ? 4 : d); }
  function ext(href, text, extra) {
    return h('a', { href: href, target: '_blank', rel: 'noopener', class: 'ext' + (extra ? ' ' + extra : ''), text: text });
  }
  function link(href, text) { return h('a', { href: href, text: text }); }
  function safeUrl(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u : null; }

  var DATA = null, RUNS = [], BYID = {}, MRS = {}, CHAINS = [], FIRST_SEAL = true;
  var REASON_TITLE = {
    MODEL_HASH_MISMATCH: 'Stale evidence: the model differs from the evaluated model',
    IMAGE_DIGEST_MISMATCH: 'Stale evidence: the image differs from the evaluated image',
    DATA_HASH_MISMATCH: 'Stale evidence: the evaluation data differs',
    POLICY_HASH_MISMATCH: 'Stale evidence: the policy changed after evaluation',
    COMMIT_MISMATCH: 'Stale evidence: different commit',
    PIPELINE_IDENTITY_MISMATCH: 'Stale evidence: different pipeline',
    ACCURACY_BELOW_THRESHOLD: 'Policy not met: accuracy below the minimum',
    FAIRNESS_GAP_EXCEEDED: 'Policy not met: fairness gap over the maximum',
    FAIRNESS_NOT_EVALUABLE: 'Unverifiable: fairness could not be measured',
    SECURITY_EVIDENCE_MISSING: 'Unverifiable: security evidence missing',
    EVIDENCE_MISSING: 'Unverifiable: evidence missing',
    EVIDENCE_INVALID: 'Unverifiable: an evidence value is not trusted',
    METRICS_MISMATCH: 'Disputed: claimed metrics differ from the recomputed metrics',
    METRICS_UNVERIFIABLE: 'Unverifiable: the Witness could not recompute the metrics'
  };
  var SCENARIO = { a: 'Healthy model', 'b-stale': 'Stale evidence', c: 'Fairness regression', d: 'Baseline model', regression: 'Fairness regression (demo)' };
  var CHECK_LABEL = { accuracy: 'Accuracy', commit: 'Commit identity', data_identity: 'Evaluation data identity', fairness: 'Fairness', image_identity: 'Image identity',
    metrics_match: 'Claimed metrics match', metrics_recomputed: 'Metrics recomputed from the model', model_identity: 'Model identity', pipeline_identity: 'Pipeline identity',
    policy_identity: 'Policy identity', security: 'Security evidence', impact: 'Impact analysis' };

  // ---------------------------------------------------------------- small components
  function st(tone, label, title) {   // one status per item; solid marker = real event, dashed ring = recorded only, mock or pending
    return h('span', { class: 'st ' + tone, title: title || false }, [h('i', { 'aria-hidden': 'true' }), label]);
  }
  function copyBtn(value, what) {
    var b = h('button', { class: 'copy noprint', type: 'button', 'aria-label': 'Copy ' + what, text: 'Copy' });
    b.addEventListener('click', function () {
      function done() { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(done, fallback); else fallback();
      function fallback() {
        var t = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-999px' }); t.value = value; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); done(); } catch (e) { b.textContent = 'Select and copy manually'; } t.remove();
      }
    });
    return b;
  }
  function mono(text) { return h('span', { class: 'mono', text: text }); }
  function monoCopy(value, what) { return h('span', {}, [mono(value), copyBtn(value, what)]); }
  function kv(rows) {
    var dl = h('dl', { class: 'kv' });
    rows.forEach(function (r) { if (!r) return; dl.appendChild(h('dt', { text: r[0] })); dl.appendChild(h('dd', {}, [r[1]])); });
    return dl;
  }
  function empty(title, how) { return h('div', { class: 'empty' }, [h('b', { text: title }), how ? ' ' + how : '']); }
  function section(title, sub) {
    var el = h('section', { class: 'block' }, [h('h2', { text: title })]);
    if (sub) el.appendChild(h('p', { class: 'sub', text: sub }));
    return el;
  }
  function pagehead(title, sub) { return h('div', { class: 'pagehead' }, [h('h1', { text: title }), sub ? h('p', { class: 'muted', text: sub }) : null]); }
  function userLink(username) { return h('a', { href: 'https://gitlab.com/' + encodeURIComponent(username), target: '_blank', rel: 'noopener', class: 'ext', text: '@' + username }); }

  // ---------------------------------------------------------------- run helpers
  function decision(run) {
    switch (run.outcome) {
      case 'released_eligible': return { tone: 'pass', label: 'Eligible' };
      case 'expected_block': return { tone: 'fail', label: 'Blocked' };
      case 'unexpected_block': return { tone: 'fail', label: 'Blocked (unexpected)' };
      case 'unexpected_pass': return { tone: 'attn', label: 'Passed (unexpected)' };
      case 'running': return { tone: 'pending', label: 'Running' };
      case 'no_decision': return { tone: 'pending', label: 'No decision' };
      default: return { tone: 'pending', label: 'Not a release run' };
    }
  }
  function policyChange(run) { var pc = run.policy_change; return pc && (pc.status === 'hold' || pc.status === 'approved') ? pc : null; }
  function holdStatus(pc) {
    return pc.status === 'hold' ? st('attn', 'Held: policy change needs review', 'Changed: ' + (pc.changed_paths || []).join(', ') + '. A person must start the manual job approve-policy-change.')
      : st('pass', 'Policy change approved by @' + pc.approved_by, 'Approved ' + (pc.approved_at || 'at a time not recorded') + (pc.self_approval ? '. Self-approval: recorded as a separation-of-duties gap.' : ''));
  }
  function decisionStatus(run) {
    var d = decision(run), pc = policyChange(run);
    if (pc && pc.status === 'hold') return holdStatus(pc);
    return st(d.tone, d.label);
  }
  function isSigned(run) { var e = run.signature && run.signature.evidence; return !!(e && e.signed && e.rekor && e.rekor.log_index != null); }
  function signedStatus(run) {
    if (isSigned(run)) return st('pass', 'Signed');
    return st('pending', 'Not signed', 'Signing runs on main-branch pipelines; earlier runs and non-main runs have no signature.');
  }
  function releasedBy(run) {
    if (run.outcome !== 'released_eligible') return h('span', { class: 'muted', text: 'Not applicable' });
    if (!run.deploy_job_user) return st('pending', 'Not started');
    var mock = !!(run.deployment && run.deployment.mock);
    return h('span', {}, [st(mock ? 'mock' : 'pass', '@' + run.deploy_job_user, mock ? 'The release job was started by this person; the release is recorded only, no service was deployed (mock).' : 'Release job started by this person.')]);
  }
  function runtimeStatus(run) {
    var stage = run.release_stage;
    if (run.outcome !== 'released_eligible') return h('span', { class: 'muted', text: 'Not applicable' });
    if (stage === 'runtime_verified') return st('pass', 'Runtime verified');
    if (stage === 'artifact_verified') return st('pass', 'Digest verified', 'The published model matches the signed evidence. An artifact-integrity check, not a live-inference test.');
    if (stage === 'runtime_verify_failed') return st('fail', 'Check failed');
    return st('pending', 'Not checked');
  }
  function mrInfo(run) {
    var m = run.mr || { kind: 'undetermined', how: 'not recorded' };
    if (m.kind === 'mr') { var rec = MRS[m.iid]; return { key: String(m.iid), iid: m.iid, title: rec ? rec.title : null, url: rec ? rec.web_url : (DATA.project_url + '/-/merge_requests/' + m.iid) }; }
    if (m.kind === 'direct') return { key: 'direct', title: 'Direct to main', how: 'GitLab lists no merge request for these commits.' };
    return { key: 'undetermined', title: 'MR not determined', how: 'The records do not tie these commits to one merge request (' + m.how + ').' };
  }
  function mrCell(run, whole) {
    var m = mrInfo(run);
    if (m.iid) {
      var full = '!' + m.iid + (m.title ? ' ' + m.title : ''), shown = !whole && full.length > 34 ? full.slice(0, 33).trimEnd() + '\u2026' : full;
      var a = ext(m.url, shown); a.setAttribute('title', full); return a;
    }
    return h('span', { class: 'muted', title: m.how || false, text: m.title });
  }
  function changeText(run) {
    var t = run.commit_title || ('Commit ' + (run.sha || '').slice(0, 8));
    return run.fixture ? t + ' (labelled demo fixture)' : t;
  }
  function approvalText(mr) {
    var by = ((mr.approvals || {}).approved_by || []).map(function (a) { return a.username; });
    if (!by.length) return null;
    var self = mr.author && by.indexOf(mr.author.username) >= 0;
    return 'Approved by ' + by.map(function (u) { return '@' + u; }).join(', ') + (self ? ' (self-approval: single-member demo project)' : '');
  }
  function newest(list) { return list.slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0]; }
  function sortDesc(list) { return list.slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }); }
  function releaseRuns() { return RUNS.filter(function (r) { return r.kind === 'release' || r.kind === 'merge_request'; }); }
  function chainFor(run) { return CHAINS.filter(function (c) { return c.blocked_run === run.id || c.corrected_run === run.id || c.release_run === run.id; })[0] || null; }
  function runLink(run, text) { return link('#/releases/' + run.id, text || String(run.id)); }

  // ---------------------------------------------------------------- THE SEAL
  function sealPanel(run, opts) {
    var seal = run.seal;
    if (!seal) return empty('No seal for this run.', 'The evidence or the image hash was not recorded, so there is nothing to compare.');
    var ok = seal.identical;
    var wrap = h('div', { class: 'seal', role: 'group', 'aria-label': 'Comparison of the evidenced and the recomputed model hash' });
    function hashRow(label, groups, full, what) {
      return h('div', { class: 'row' }, [
        h('span', { class: 'lbl', text: label }),
        h('span', { class: 'hash', 'aria-label': what + ' ' + full }, groups.map(function (g) {
          var chars = g.text.split('').map(function (c, i) { return g.diff[i] ? h('span', { class: 'd', text: c }) : document.createTextNode(c); });
          return h('span', { class: 'g' }, chars);
        })),
        copyBtn(full, what)
      ]);
    }
    wrap.appendChild(hashRow('Evaluated (evidence)', seal.evidenced, seal.evidenced_full, 'evidenced model hash'));
    // the seal line draws closed once, on the first load of the page; a mismatch is a visibly broken line
    var draw = ok && FIRST_SEAL && !(opts && opts.static); if (ok) FIRST_SEAL = false;
    var line = ok ? h('div', { class: 'sealline' + (draw ? ' draw' : ''), 'aria-hidden': 'true' }, [h('i', { class: 'bar' })])
      : h('div', { class: 'sealline broken', 'aria-hidden': 'true' }, [h('i', { class: 'bar a' }), h('i', { class: 'cut', text: 'x' }), h('i', { class: 'bar b' })]);
    wrap.appendChild(h('div', { class: 'row' }, [h('span'), line, h('span')]));
    wrap.appendChild(h('div', { class: 'row' }, [h('span'), h('p', { class: 'verdict ' + (ok ? 'ok' : 'bad'),
      text: ok ? 'Identical: the model in the release image is the model the evidence describes.' : 'Does not match: ' + seal.differing + ' of 64 characters differ. The model in the release image is not the evaluated model.' }), h('span')]));
    wrap.appendChild(hashRow('Recomputed from the image', seal.observed, seal.observed_full, 'recomputed model hash'));
    return wrap;
  }

  // ---------------------------------------------------------------- gate rail
  function rail(run) {
    var jobs = run.jobs_ran || [], ran = function (n) { return jobs.indexOf(n) >= 0; };
    var blocked = run.outcome === 'expected_block' || run.outcome === 'unexpected_block';
    var decided = !!run.has_decision;
    var mock = !!(run.deployment && run.deployment.mock);
    function step(name, tone, detail) { return { name: name, tone: tone, detail: detail }; }
    var after = blocked ? 'Not reached: blocked' : null;
    var steps = [
      step('Build the image', ran('package-image') ? 'pass' : 'pending', ran('package-image') ? 'Image built and pushed' : 'No record'),
      step('Evaluate the model', ran('evaluate-model') || ran('replay-stale-evidence') ? 'pass' : 'pending', 'Metrics from the model in the image'),
      step('Bind the evidence', ran('bind-evidence') ? 'pass' : 'pending', 'Hashes tied to the metrics'),
      step('Witness decision', decided ? (blocked ? 'fail' : 'pass') : 'pending', decided ? (blocked ? 'Blocked: ' + ((run.reason_codes || [])[0] || 'no code') : 'Eligible') : 'No decision recorded'),
      policyChange(run) ? step('Policy change review', policyChange(run).status === 'approved' ? 'pass' : 'attn', policyChange(run).status === 'approved' ? 'Approved by @' + policyChange(run).approved_by + (policyChange(run).self_approval ? ' (self-approval)' : '') : 'Held: policy change needs review') : null,
      step('Sign the evidence', isSigned(run) ? 'pass' : 'pending', blocked ? (isSigned(run) ? 'Signed' : after) : (isSigned(run) ? 'Signed (Sigstore, Rekor)' : 'Not signed')),
      step('Release by a person', blocked ? 'pending' : (run.deploy_job_user ? (mock ? 'mock' : 'pass') : 'pending'),
        blocked ? after : (run.deploy_job_user ? ('Started by @' + run.deploy_job_user + (mock ? '; recorded only, no service deployed' : '')) : 'Waiting for a person')),
      step('Runtime digest check', run.release_stage === 'artifact_verified' || run.release_stage === 'runtime_verified' ? 'pass' : (run.release_stage === 'runtime_verify_failed' ? 'fail' : 'pending'),
        blocked ? after : (run.release_stage === 'artifact_verified' ? 'Published model matches the evidence' : run.release_stage === 'runtime_verified' ? 'Service reported the evidenced hash' : 'Not checked'))
    ];
    steps = steps.filter(Boolean);
    return h('ol', { class: 'rail', style: '--cols:' + steps.length, 'aria-label': 'Release gate steps' }, steps.map(function (x) {
      return h('li', { class: x.tone }, [h('span', { class: 'dot', 'aria-hidden': 'true' }), h('b', { text: x.name }), h('span', { text: x.detail })]);
    }));
  }

  // ---------------------------------------------------------------- ledger
  var COLS = [['Time', 'Time'], ['Change', 'Change'], ['Scope', 'Scope'], ['MR', 'Merge request'], ['Decision', 'Decision'], ['Reason', 'Reason code'], ['Signed', 'Signed'], ['Released', 'Released by'], ['Runtime', 'Runtime']];
  var SCOPE_LABEL = { model: 'Model', pipeline: 'Pipeline', dashboard: 'Dashboard', docs: 'Docs' };
  function scopeText(run) { return run.change_scope ? run.change_scope.map(function (x) { return SCOPE_LABEL[x] || x; }).join(', ') : 'Not recorded'; }
  // A run is model-affecting when its commit touched the model, data, serving, policy or security paths, when its changed files could
  // not be read (never assumed harmless), or when the Witness blocked it.
  function modelAffecting(run) {
    return !run.change_scope || run.change_scope.indexOf('model') >= 0 || run.outcome === 'expected_block' || run.outcome === 'unexpected_block';
  }
  function scopeToggle(base, q, onPick) {
    function href(v) { return base === 'releases' ? '#/releases' + queryString(Object.assign({}, q, { scope: v })) : '#/overview' + (v ? '?scope=' + v : ''); }
    var a = h('a', { href: href(''), 'aria-pressed': q.scope === 'all' ? 'false' : 'true', text: 'Model-affecting changes' });
    var b = h('a', { href: href('all'), 'aria-pressed': q.scope === 'all' ? 'true' : 'false', text: 'All changes' });
    return { el: h('div', { class: 'seg', role: 'group', 'aria-label': 'Which changes to show' }, [a, b]), a: a, b: b, href: href };
  }
  function ledgerRow(run) {
    var codes = run.reason_codes || [];
    var tr = h('tr', { class: 'row' });
    function td(label, kid, cls) { tr.appendChild(h('td', { 'data-label': label, class: cls || false }, [kid])); }
    td('Time', h('a', { href: '#/releases/' + run.id, text: fmtShort(run.created_at), title: fmtTime(run.created_at) }), 'nowrap');
    var full = changeText(run), line = (run.commit_title || full).split('\n')[0], short = line.length > 70 ? line.slice(0, 69).trimEnd() + '\u2026' : line;
    td('Change', h('span', { title: full }, [short, run.fixture ? h('div', { class: 'sub', text: 'Labelled demo fixture' }) : null, run.cause ? h('div', { class: 'sub', text: run.cause.text }) : null, run.stopped_at ? h('div', { class: 'sub' }, [run.stopped_at.text + ' ', run.stopped_at.url ? ext(run.stopped_at.url, 'Open') : null]) : null]));
    td('Scope', h('span', { class: run.change_scope ? false : 'muted', text: scopeText(run) }));
    td('Merge request', mrCell(run));
    td('Decision', decisionStatus(run));
    td('Reason code', codes.length ? h('span', { class: 'reason', text: codes.join(', ').replace(/_/g, '_\u200b') }) : h('span', { class: 'muted', text: 'None' }));
    td('Signed', run.outcome === 'released_eligible' || isSigned(run) ? signedStatus(run) : h('span', { class: 'muted', text: 'Not applicable' }));
    td('Released by', releasedBy(run));
    td('Runtime', runtimeStatus(run));
    tr.addEventListener('click', function (e) { if (e.target.closest('a,button')) return; location.hash = '#/releases/' + run.id; });
    return tr;
  }
  function ledgerTable(runs) {
    if (!runs.length) return empty('No runs match.', 'Clear a filter to see more.');
    var head = h('tr', {}, COLS.map(function (c) { return h('th', { scope: 'col', text: c[1] }); }));
    return h('div', { class: 'tablewrap' }, [h('table', { class: 't stack ledger' }, [h('thead', {}, [head]), h('tbody', {}, runs.map(ledgerRow))])]);
  }

  // ---------------------------------------------------------------- overview
  function overview(q) {
    q = q || {};
    var main = h('div', {});
    var releases = sortDesc(RUNS.filter(function (r) { return r.kind === 'release' && r.ref === 'main' && r.has_decision; }));
    var latest = releases[0];
    var sentence = !latest ? 'No release candidate has been recorded yet.'
      : latest.outcome === 'released_eligible'
        ? 'The latest release candidate, pipeline ' + latest.id + ', passed the Witness' + (latest.deploy_job_user ? '.' : ' and is waiting for a person to release it.')
        : 'The latest release candidate, pipeline ' + latest.id + ', was blocked by the Witness.';
    main.appendChild(pagehead('Overview', sentence));

    if (latest) {
      var sealSection = section('The seal', 'Both hashes are the full SHA-256 of the model file, in groups of four. The Witness hashes the model it extracts from the release image and compares it with the model the evidence was produced for.');
      sealSection.appendChild(h('div', { class: 'panel' }, [sealPanel(latest)]));
      sealSection.appendChild(h('p', { style: 'margin-top:12px' }, [link('#/releases/' + latest.id, 'Open the case file for this release')]));
      main.appendChild(sealSection);
      var gate = section('Release gate', 'Pipeline ' + latest.id + ', ' + fmtTime(latest.created_at) + '. The gate checks the model in the release image against the evidence it was evaluated with.');
      gate.appendChild(h('div', { class: 'panel' }, [rail(latest)]));
      main.appendChild(gate);
    } else main.appendChild(empty('No release gate to show.', 'A main-branch pipeline with a Witness decision appears here.'));

    // needs attention + last policy block
    var cols = h('div', { class: 'cols block' });
    var attention = h('div', { class: 'panel' }, [h('h2', { text: 'Needs attention' })]);
    var items = DATA.attention || [];
    if (!items.length) attention.appendChild(h('p', { class: 'muted', text: 'Nothing needs attention. Every open item the records can show is closed.' }));
    else attention.appendChild(h('ul', { class: 'attn-list' }, items.map(function (i) {
      var fix = i.fix.external ? ext(i.fix.href, i.fix.label) : link(i.fix.href, i.fix.label);
      return h('li', {}, [st('attn', i.kind === 'waiting_for_person' ? 'Waiting for a person' : i.kind === 'repair_review' ? 'Repair awaiting review' : i.kind === 'block_awaiting_repair' ? 'Block awaiting repair' : i.kind === 'guard_failed' ? 'Guard check failed' : i.kind === 'separation_of_duties' ? 'Separation of duties' : i.kind === 'policy_change_held' ? 'Held: policy change needs review' : i.kind === 'guard_missing' ? 'Guard missing' : i.kind === 'block_without_cause' ? 'Cause not recorded' : i.kind === 'no_reverification' ? 'Re-verification not run' : 'Unsigned run'), h('p', { text: i.text }), h('p', { class: 'sub' }, ['Fix it here: ', fix])]);
    })));
    cols.appendChild(attention);

    var blocks = sortDesc(RUNS.filter(function (r) { return r.has_decision && (r.outcome === 'expected_block' || r.outcome === 'unexpected_block'); }));
    var last = blocks[0];
    var lastPanel = h('div', { class: 'panel' }, [h('h2', { text: 'Last policy block' })]);
    if (!last) lastPanel.appendChild(h('p', { class: 'muted', text: 'No release has been blocked.' }));
    else {
      var code = (last.reason_codes || [])[0], m = last.metrics || {}, th = last.thresholds || {}, ch = chainFor(last);
      var observed = code === 'FAIRNESS_GAP_EXCEEDED' ? 'Fairness gap ' + num(m.fairness_gap) + ' against a maximum of ' + th.maximum_fairness_gap
        : code === 'ACCURACY_BELOW_THRESHOLD' ? 'Accuracy ' + num(m.accuracy) + ' against a minimum of ' + th.minimum_accuracy : (REASON_TITLE[code] || 'Blocked');
      lastPanel.appendChild(kv([
        ['Pipeline', h('span', {}, [runLink(last), ' ', decisionStatus(last)])],
        ['When', fmtTime(last.created_at)],
        ['Reason', h('span', {}, [h('span', { class: 'reason', text: code || 'none' }), h('div', { class: 'sub', text: REASON_TITLE[code] || '' })])],
        ['Measured', observed],
        ['Cause', last.cause ? h('span', {}, [last.cause.text, last.cause.fixed_in ? h('span', {}, [' Fixed in ', ext(DATA.project_url + '/-/commit/' + last.cause.fixed_in.sha, last.cause.fixed_in.sha.slice(0, 8))]) : ' No fixing commit is recorded.'])
          : last.fixture ? 'A labelled demo fixture commit that injects a fairness regression, so this block is the expected result.' : 'Not determined from the records.'],
        ['Investigation', ch && ch.issue ? ext(ch.issue.web_url, 'Issue #' + ch.issue.iid) : 'No investigation issue recorded'],
        ch ? ['Chain of custody', link('#/releases/' + last.id + '/custody', ch.steps_done + ' of ' + ch.steps_total + ' steps recorded')] : null
      ]));
    }
    cols.appendChild(lastPanel);
    main.appendChild(cols);

    var shown = sortDesc(releaseRuns()).filter(function (r) { return q.scope === 'all' || modelAffecting(r); });
    var led = section('Release ledger', 'The latest 10 ' + (q.scope === 'all' ? 'runs' : 'runs that affect the model') + ', newest first. ' + (q.scope === 'all' ? '' : (releaseRuns().length - shown.length) + ' other runs (pipeline, dashboard and docs changes) are hidden.'));
    led.appendChild(h('div', { style: 'margin-bottom:12px' }, [scopeToggle('overview', q).el]));
    led.appendChild(ledgerTable(shown.slice(0, 10)));
    led.appendChild(h('p', { style: 'margin-top:12px' }, [link('#/releases' + (q.scope === 'all' ? '?scope=all' : ''), 'See all releases')]));
    main.appendChild(led);
    if (DATA.snapshot) { var snap = section('Snapshot data', 'This dashboard is a static snapshot. Whether that data is signed:'); snap.appendChild(h('div', { class: 'panel' }, [snapshotSignature()])); main.appendChild(snap); }
    return main;
  }

  // ---------------------------------------------------------------- releases: ledger and merge request view
  var Q_KEYS = ['scope', 'group', 'mr', 'decision', 'reason', 'signed', 'from', 'to', 'q'];
  function queryString(q) {
    var p = []; Q_KEYS.forEach(function (k) { if (q[k]) p.push(k + '=' + encodeURIComponent(q[k])); }); return p.length ? '?' + p.join('&') : '';
  }
  function applyFilters(runs, q) {
    var needle = (q.q || '').trim().toLowerCase().replace(/^!/, '');
    return runs.filter(function (r) {
      var d = r.outcome;
      if (q.scope !== 'all' && !modelAffecting(r)) return false;
      if (q.decision === 'eligible' && d !== 'released_eligible') return false;
      if (q.decision === 'blocked' && d !== 'expected_block' && d !== 'unexpected_block') return false;
      if (q.decision === 'none' && d !== 'no_decision') return false;
      if (q.reason && (r.reason_codes || []).indexOf(q.reason) < 0) return false;
      if (q.signed === 'yes' && !isSigned(r)) return false;
      if (q.signed === 'no' && isSigned(r)) return false;
      var day = (r.created_at || '').slice(0, 10);
      if (q.from && day < q.from) return false;
      if (q.to && day > q.to) return false;
      if (q.mr && mrInfo(r).key !== q.mr) return false;
      if (needle) {
        var m = mrInfo(r), hay = [String(r.id), r.sha || '', r.commit_title || '', m.iid ? String(m.iid) : '', m.title || ''].join(' ').toLowerCase();
        if (hay.indexOf(needle) < 0) return false;
      }
      return true;
    });
  }
  // Flat exports of the rows on screen. The same rows are written next to the dashboard (ledger.csv, chains.csv and the JSON files).
  function csvCell(v) {
    var t = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;                      // a spreadsheet would run this as a formula
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function toCsv(cols, rows) {
    return [cols.map(csvCell).join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return csvCell(r[c]); }).join(','); })).join('\r\n') + '\r\n';
  }
  function saveText(name, text, type) {
    try { var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type })), download: name }); document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* downloads can be blocked; the static files remain */ }
  }
  function exportBar(getRows) {
    var ex = DATA.exports || { ledger: [], chains: [], ledger_columns: [], chain_columns: [] };
    function visible() {
      var ids = {}; getRows().forEach(function (r) { ids[r.id] = true; });
      return { ledger: ex.ledger.filter(function (r) { return ids[r.pipeline_id]; }),
               chains: ex.chains.filter(function (c) { return ids[c.blocked_pipeline] || ids[c.corrected_pipeline] || ids[c.release_pipeline]; }) };
    }
    function btn(label, fn) { var b = h('button', { type: 'button', class: 'btn', text: label }); b.addEventListener('click', fn); return b; }
    return h('div', { class: 'exports', role: 'group', 'aria-label': 'Export' }, [
      h('span', { class: 'sub', text: 'Export the rows shown:' }),
      btn('Ledger CSV', function () { saveText('gasket-ledger.csv', toCsv(ex.ledger_columns, visible().ledger), 'text/csv'); }),
      btn('Ledger JSON', function () { saveText('gasket-ledger.json', JSON.stringify(visible().ledger, null, 1) + '\n', 'application/json'); }),
      btn('Chains of custody CSV', function () { saveText('gasket-chains.csv', toCsv(ex.chain_columns, visible().chains), 'text/csv'); }),
      btn('Chains of custody JSON', function () { saveText('gasket-chains.json', JSON.stringify(visible().chains, null, 1) + '\n', 'application/json'); }),
      h('span', { class: 'sub' }, ['Everything: ', h('a', { href: 'ledger.csv', text: 'ledger.csv' }), ' ', h('a', { href: 'ledger.json', text: 'ledger.json' }), ' ', h('a', { href: 'chains.csv', text: 'chains.csv' }), ' ', h('a', { href: 'chains.json', text: 'chains.json' })])]);
  }
  function releasesPage(q) {
    var main = h('div', {});
    main.appendChild(pagehead('Releases', 'Every release candidate and merge request pipeline, newest first. Open a row for its case file.'));
    var all = sortDesc(releaseRuns());
    var reasons = {}; all.forEach(function (r) { (r.reason_codes || []).forEach(function (c) { reasons[c] = true; }); });
    var mrOptions = {}; all.forEach(function (r) { var m = mrInfo(r); if (m.iid) mrOptions[m.key] = m; });
    var form = h('form', { class: 'filters', role: 'search', 'aria-label': 'Filter releases' });
    function field(label, control) { return h('label', {}, [label, control]); }
    function select(name, options, value) {
      var el = h('select', { name: name }, options.map(function (o) { var opt = h('option', { value: o[0], text: o[1] }); if (o[0] === (value || '')) opt.selected = true; return opt; })); return el;
    }
    var ctl = {
      mr: select('mr', [['', 'All']].concat([['direct', 'Direct to main'], ['undetermined', 'MR not determined']]).concat(Object.keys(mrOptions).sort(function (a, b) { return b - a; }).map(function (k) { return [k, '!' + k + (mrOptions[k].title ? ' ' + mrOptions[k].title : '')]; })), q.mr),
      decision: select('decision', [['', 'All'], ['eligible', 'Eligible'], ['blocked', 'Blocked'], ['none', 'No decision']], q.decision),
      reason: select('reason', [['', 'All']].concat(Object.keys(reasons).sort().map(function (c) { return [c, c]; })), q.reason),
      signed: select('signed', [['', 'All'], ['yes', 'Signed'], ['no', 'Not signed']], q.signed),
      from: h('input', { type: 'date', name: 'from', value: q.from || false }),
      to: h('input', { type: 'date', name: 'to', value: q.to || false }),
      q: h('input', { type: 'search', name: 'q', value: q.q || false, placeholder: 'Run ID, commit or MR', 'aria-label': 'Search by run ID, commit or merge request' })
    };
    form.appendChild(field('Search', ctl.q)); form.appendChild(field('Merge request', ctl.mr)); form.appendChild(field('Decision', ctl.decision));
    form.appendChild(field('Reason code', ctl.reason)); form.appendChild(field('Signed', ctl.signed)); form.appendChild(field('From', ctl.from)); form.appendChild(field('To', ctl.to));
    var grouping = h('div', { class: 'seg', role: 'group', 'aria-label': 'Group by' }, [
      h('a', { href: '#/releases' + queryString(Object.assign({}, q, { group: '' })), 'aria-pressed': q.group === 'mr' ? 'false' : 'true', text: 'Run' }),
      h('a', { href: '#/releases' + queryString(Object.assign({}, q, { group: 'mr' })), 'aria-pressed': q.group === 'mr' ? 'true' : 'false', text: 'Merge request' })]);
    form.appendChild(h('label', {}, ['Group by', grouping]));
    var scopeCtl = scopeToggle('releases', q);
    form.appendChild(h('label', {}, ['Show', scopeCtl.el]));
    var results = h('div', { 'aria-live': 'polite' }), shownRows = [];
    function current() { var next = { group: q.group, scope: q.scope }; Object.keys(ctl).forEach(function (k) { next[k] = ctl[k].value; }); return next; }
    function refresh() {
      var next = current();
      try { history.replaceState(null, '', '#/releases' + queryString(next)); } catch (e) { /* the page still works without a shareable URL */ }
      q = next; draw(); }
    function draw() {
      results.textContent = '';
      var rows = applyFilters(all, q); shownRows = rows;
      results.appendChild(h('p', { class: 'sub', text: rows.length + ' of ' + all.length + ' runs' + (q.scope === 'all' ? '' : '. Showing model-affecting changes; choose All changes to include pipeline, dashboard and docs changes.') }));
      results.appendChild(q.group === 'mr' ? mrGroups(rows, q) : ledgerTable(rows));
      // keep the group toggle links in step with the filters
      grouping.querySelectorAll('a')[0].setAttribute('href', '#/releases' + queryString(Object.assign({}, q, { group: '' })));
      grouping.querySelectorAll('a')[1].setAttribute('href', '#/releases' + queryString(Object.assign({}, q, { group: 'mr' })));
      scopeCtl.a.setAttribute('href', '#/releases' + queryString(Object.assign({}, q, { scope: '' })));
      scopeCtl.b.setAttribute('href', '#/releases' + queryString(Object.assign({}, q, { scope: 'all' })));
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); refresh(); });
    Object.keys(ctl).forEach(function (k) { ctl[k].addEventListener(k === 'q' ? 'input' : 'change', refresh); });
    main.appendChild(form); main.appendChild(exportBar(function () { return shownRows; })); main.appendChild(results); draw();
    return main;
  }
  function duoLine(iid) {
    var item = ((DATA.duo || {}).items || []).filter(function (i) { return i.mr_iid === iid; })[0];
    if (!item) return 'No Duo assessment recorded';
    var risk = item.risk_result === 'agreed' ? 'risk agreed' : item.risk_result === 'witness_stricter' ? 'risk: Witness stricter' : 'risk: Witness looser';
    return 'Duo against Witness: ' + risk + '; ' + (item.evidence_witness_added.length ? 'evidence added by the Witness: ' + item.evidence_witness_added.join(', ') : 'evidence agreed');
  }
  function mrGroups(runs, q) {
    var groups = {};
    runs.forEach(function (r) { var m = mrInfo(r); (groups[m.key] = groups[m.key] || { info: m, runs: [] }).runs.push(r); });
    var list = Object.keys(groups).map(function (k) { var g = groups[k]; g.runs = sortDesc(g.runs); g.latest = g.runs[0]; return g; })
      .sort(function (a, b) { return a.latest.created_at < b.latest.created_at ? 1 : -1; });
    if (!list.length) return empty('No runs match.', 'Clear a filter to see more.');
    var wrap = h('div', {});
    list.forEach(function (g) {
      var m = g.info, rec = m.iid ? MRS[m.iid] : null;
      var title = m.iid ? h('span', { class: 'mrtitle' }, [ext(m.url, '!' + m.iid + (m.title ? ' ' + m.title : ''))]) : h('span', { class: 'mrtitle', text: m.title });
      var who = [];
      if (rec && rec.merged_by) who.push('Merged by @' + rec.merged_by.username);
      var starter = g.runs.filter(function (r) { return r.deploy_job_user; })[0];
      if (starter) who.push('Release started by @' + starter.deploy_job_user);
      if (rec) { var a = approvalText(rec); if (a) who.push(a); }
      var d = h('details', { class: 'mrg' }, [h('summary', {}, [
        h('div', {}, [title, h('div', { class: 'sub', text: g.runs.length + (g.runs.length === 1 ? ' run' : ' runs') + (m.how ? '. ' + m.how.charAt(0).toUpperCase() + m.how.slice(1) : '') })]),
        h('div', {}, [decisionStatus(g.latest), h('div', { class: 'sub', text: 'Latest: ' + fmtTime(g.latest.created_at) })]),
        h('div', {}, [m.iid ? h('div', { class: 'sub', text: duoLine(m.iid) }) : null, h('div', { class: 'sub', text: who.length ? who.join('. ') : 'No merge or release record' })])
      ])]);
      if (q.mr && q.mr === m.key) d.setAttribute('open', '');
      var body = h('div', { class: 'body' }, [ledgerTable(g.runs)]);
      d.appendChild(body); wrap.appendChild(d);
    });
    return wrap;
  }

  // ---------------------------------------------------------------- release case file
  var TABS = [['decision', 'Decision'], ['evidence', 'Evidence'], ['signature', 'Signature and provenance'], ['agents', 'Agents'], ['custody', 'Chain of custody'], ['files', 'Files']];
  function meter(label, value, limit, kind, unit) {
    var over = kind === 'max' ? value > limit : value < limit;
    var scale = kind === 'max' ? limit * 2 : 1;
    var pct = Math.max(0, Math.min(100, (value / scale) * 100)), at = Math.max(0, Math.min(100, (limit / scale) * 100));
    var fill = h('i'); fill.style.width = pct + '%';
    var mark = h('em'); mark.style.left = at + '%';
    return h('div', { class: 'meter' }, [
      h('div', { class: 'top2' }, [h('b', { text: label }), h('span', {}, [st(over ? 'fail' : 'pass', over ? 'Policy not met' : 'Within policy'), ' ', mono(num(value))])]),
      h('div', { class: 'track' + (over ? ' over' : ''), role: 'img', 'aria-label': label + ' ' + num(value) + ', limit ' + limit }, [fill, mark]),
      h('div', { class: 'cap', text: (kind === 'max' ? 'Maximum allowed ' : 'Minimum required ') + limit + (unit || '') + '. The vertical marker is the limit.' })]);
  }
  function digestCheck(run) {
    var stage = run.release_stage;
    if (stage === 'artifact_verified' || stage === 'runtime_verified') return st('pass', 'Digest verified', 'The published model matches the signed evidence.');
    if (stage === 'runtime_verify_failed') return st('fail', 'Check failed');
    return st('pending', 'Not run');
  }
  function liveInferenceCheck(run) {
    var li = run.live_inference;
    if (!li) return h('span', {}, [st('pending', 'Not run'), h('div', { class: 'sub', text: 'It runs only after a real Cloud Run deployment, and fails closed there. No live service exists for this release.' })]);
    if (li.status === 'passed') return h('span', {}, [st('pass', 'Passed'), h('div', { class: 'sub', text: li.note })]);
    if (li.status === 'skipped') return h('span', {}, [st('pending', 'Skipped'), h('div', { class: 'sub', text: li.note })]);
    return h('span', {}, [st('fail', 'Failed'), h('div', { class: 'sub', text: li.note || li.failure || '' })]);
  }
  function decisionTab(run) {
    var el = h('div', {}), m = run.metrics || {}, th = run.thresholds || {}, codes = run.reason_codes || [];
    var d = decision(run);
    var statement = run.outcome === 'released_eligible' ? 'The Witness found the model hash identical to the evidence and every policy check passed. A person still has to release it.'
      : (run.outcome === 'expected_block' || run.outcome === 'unexpected_block') ? (REASON_TITLE[codes[0]] || 'The Witness blocked this release.') + '. Deployment was skipped; the run stays listed with its reason.'
      : run.stopped_at ? run.stopped_at.text : 'No Witness decision was retained for this run.';
    el.appendChild(h('p', { class: 'lead' }, [decisionStatus(run), statement]));
    if (run.cause) el.appendChild(h('p', {}, [h('b', { text: 'Cause. ' }), run.cause.text, run.cause.fixed_in ? h('span', {}, [' Fixed in ', ext(DATA.project_url + '/-/commit/' + run.cause.fixed_in.sha, run.cause.fixed_in.sha.slice(0, 8)), ': ' + run.cause.fixed_in.title + '.']) : ' No fixing commit is recorded.']));
    if (run.stopped_at && run.stopped_at.url) el.appendChild(h('p', {}, [ext(run.stopped_at.url, 'Open the job in GitLab')]));
    if (codes.length) el.appendChild(kv([['Reason code', h('span', { class: 'reason', text: codes.join(', ').replace(/_/g, '_\u200b') })]]));
    if (m.accuracy != null && th.minimum_accuracy != null) el.appendChild(meter('Accuracy', m.accuracy, th.minimum_accuracy, 'min'));
    if (m.fairness_gap != null && th.maximum_fairness_gap != null) el.appendChild(meter('Fairness gap', m.fairness_gap, th.maximum_fairness_gap, 'max'));
    var checks = run.checks || {}, names = Object.keys(checks).filter(function (k) { return k.indexOf('_detail') < 0; });
    if (names.length) {
      el.appendChild(h('h3', { text: 'Policy checks' }));
      el.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 't' }, [h('thead', {}, [h('tr', {}, [h('th', { text: 'Check' }), h('th', { text: 'Result' })])]),
        h('tbody', {}, names.map(function (n) { var ok = checks[n] === 'passed'; return h('tr', {}, [h('td', { text: CHECK_LABEL[n] || n }), h('td', {}, [st(ok ? 'pass' : (String(checks[n]).indexOf('failed') === 0 ? 'fail' : 'pending'), ok ? 'Passed' : String(checks[n]).split(':')[0])])]); }))])]));
    }
    var pcx = policyChange(run);
    if (pcx) {
      el.appendChild(h('h3', { text: 'Policy change' }));
      el.appendChild(h('p', {}, [holdStatus(pcx), ' ', pcx.status === 'hold' ? 'The release jobs wait until a person starts approve-policy-change. The Witness decision above is unchanged.' : 'A person approved this change before the release jobs could run.']));
      var rowsPc = [['Reason code', h('span', { class: 'reason', text: 'POLICY_CHANGE_REQUIRES_REVIEW' })], ['Protected paths changed', h('span', {}, (pcx.changed_paths || []).map(function (x, i) { return h('span', {}, [i ? ', ' : '', mono(x)]); }))], ['Diff (SHA-256)', monoCopy(pcx.diff_sha256 || 'not recorded', 'diff hash')]];
      if (pcx.status === 'approved') { rowsPc.push(['Approved by', userLink(pcx.approved_by)], ['Approved at', pcx.approved_at ? fmtTime(pcx.approved_at) : 'not recorded'], ['Separation of duties', pcx.self_approval ? 'Gap: the approver wrote the change (single-member project)' : (pcx.separation_of_duties || 'not recorded')]); }
      if (pcx.approve_job_url) rowsPc.push(['Approval job', ext(pcx.approve_job_url, 'Open approve-policy-change in GitLab')]);
      el.appendChild(kv(rowsPc));
    }
    if (run.release_stage) {
      var mock = run.deployment && run.deployment.mock;
      el.appendChild(h('h3', { text: 'Release' }));
      el.appendChild(h('p', { text: mock ? 'The release is recorded, but no service was deployed (the receipt is marked mock). The runtime digest check compares the published model digest with the signed evidence; it is an artifact-integrity check, not a live-inference test.' : 'Release stage: ' + run.release_stage + '.' }));
      el.appendChild(kv([['Runtime digest check', digestCheck(run)], ['Live inference check', liveInferenceCheck(run)]]));
    }
    el.appendChild(h('details', { class: 'more' }, [h('summary', { text: 'Raw identifiers' }), kv([['Scenario', (SCENARIO[run.scenario] || 'Not a scenario run') + (run.scenario ? ' (key ' + run.scenario + ')' : '')], ['Outcome key', mono(run.outcome)], ['Run kind', mono(run.kind)], ['Ref', mono(run.ref)]])]));
    return el;
  }
  function evidenceTab(run) {
    var el = h('div', {}), id = run.identity || {};
    el.appendChild(h('div', { class: 'panel' }, [h('h3', { text: 'The seal' }), sealPanel(run, { static: true })]));
    var rows = [];
    function add(label, value) { if (value) rows.push([label, monoCopy(value, label.toLowerCase())]); }
    add('Evaluated model hash', run.evidenced_model_sha256); add('Recomputed model hash', run.observed_model_sha256);
    add('Image digest (evidence)', id.image_digest); add('Image digest (observed)', id.image_digest_observed);
    add('Evaluation data hash', id.data_sha256); add('Policy hash', id.policy_sha256); add('Commit', id.commit_sha || run.sha); add('Release ID', id.release_id);
    if (id.policy_id) rows.push(['Policy', h('span', {}, [id.policy_id, ' ', link('#/policy', 'Open the policy')])]);
    el.appendChild(h('div', { class: 'panel' }, [h('h3', { text: 'Identity in the evidence manifest' }), rows.length ? kv(rows) : empty('No manifest recorded for this run.', 'The Witness could not read the evidence manifest.')]));
    el.appendChild(securityPanel(run));
    el.appendChild(modelCardPanel(run));
    return el;
  }
  function fileLink(run, key, label) {
    var l = (run.evidence_links || []).filter(function (x) { return x.key === key; })[0];
    return l ? ext(l.url, label) : null;
  }
  function securityPanel(run) {
    var sec = run.security, sbomLink = fileLink(run, 'sbom', 'SBOM (CycloneDX JSON)'), scanLink = fileLink(run, 'trivy', 'Container scan (Trivy JSON)'), sumLink = fileLink(run, 'security_summary', 'Summary (JSON)');
    var panel = h('div', { class: 'panel' }, [h('h3', { text: 'Software bill of materials and container scan' })]);
    if (!sec && !sbomLink && !scanLink) { panel.appendChild(empty('No SBOM or scan recorded for this run.', 'The security-scan job produces them for the release image; runs before it existed, and runs that stopped earlier, have none.')); return panel; }
    var rows = [];
    if (sec && sec.sbom) rows.push(['SBOM', sec.sbom.format + ' ' + (sec.sbom.spec_version || '') + ', ' + sec.sbom.components + ' components' + (sec.sbom.generated_by ? ', generated by ' + sec.sbom.generated_by : '')]);
    if (sec && sec.scan) {
      var v = sec.scan.vulnerabilities || {}, fix = sec.scan.with_a_fix_available || {};
      rows.push(['Container scan', sec.scan.scanner + ': ' + sec.scan.total + ' findings (' + ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(function (k) { return (v[k] || 0) + ' ' + k.toLowerCase(); }).join(', ') + '); ' + ((fix.CRITICAL || 0) + ' critical with a fix available')]);
    }
    if (sec && sec.gate) rows.push(['Gate result', st(sec.gate === 'passed' ? 'pass' : 'fail', sec.gate === 'passed' ? 'No fixable critical findings' : 'Fixable critical findings', 'The security-scan job fails the gate on a critical finding that has a fix.')]);
    var links = [sbomLink, scanLink, sumLink].filter(Boolean);
    if (links.length) rows.push(['Files', h('span', {}, links.reduce(function (acc, l, i) { if (i) acc.push(' '); acc.push(l); return acc; }, []))]);
    panel.appendChild(kv(rows));
    return panel;
  }
  function modelCardPanel(run) {
    var panel = h('div', { class: 'panel' }, [h('h3', { text: 'Model card' })]);
    if (!run.model_card) { panel.appendChild(empty('No model card for this run.', 'A card is written only for runs that have a Witness decision and an evidence identity.')); return panel; }
    var pipelineCopy = fileLink(run, 'model_card', 'Copy written by the pipeline');
    panel.appendChild(h('p', { class: 'sub', text: 'Written only from the evidence: purpose, data hashes, metrics against the policy, decision, signer, who released it and the known limits.' }));
    panel.appendChild(h('p', {}, [h('a', { class: 'btn', href: run.model_card, target: '_blank', rel: 'noopener', text: 'Open the model card' }), pipelineCopy ? ' ' : null, pipelineCopy]));
    return panel;
  }
  function signatureTab(run) {
    var el = h('div', {}), sig = run.signature && run.signature.evidence;
    if (!isSigned(run)) {
      el.appendChild(empty('Not signed.', 'Signing runs on main-branch pipelines. Runs from before signing was added, and runs on other refs, have no signature. The evidence is still hash-bound to the artifact.'));
      return el;
    }
    var prov = run.signature.provenance;
    el.appendChild(h('p', { text: 'The evidence bundle is signed with Sigstore keyless signing using this pipeline\'s GitLab CI identity, and the signature is recorded in the public Rekor log. The signature proves the evidence came from this pipeline and is unaltered. It does not assert that a person reviewed the result.' }));
    el.appendChild(kv([
      ['Rekor log entry', ext(sig.rekor.url, '#' + sig.rekor.log_index)],
      ['Signed by identity', monoCopy(run.signature.certificate_identity, 'certificate identity')],
      ['Identity provider', mono(run.signature.oidc_issuer)],
      ['Evidence bundle hash', monoCopy(sig.blob_sha256, 'evidence bundle hash')]
    ]));
    el.appendChild(h('h3', { text: 'Verify it yourself' }));
    el.appendChild(h('p', { class: 'sub', text: 'Download the evidence bundle and its signature bundle from the Files tab into one folder, install cosign, then run:' }));
    el.appendChild(h('p', {}, [mono(sig.verify_command), copyBtn(sig.verify_command, 'verify command')]));
    el.appendChild(h('p', { class: 'sub' }, ['Expected output: ', mono('Verified OK'), '. Any other result means the file or the signature does not match.']));
    var st2 = run.provenance;
    el.appendChild(h('h3', { text: 'Provenance statement' }));
    if (st2 && st2.predicate) {
      var pr = st2.predicate, subj = (st2.subject || [])[0] || {};
      el.appendChild(h('p', { class: 'sub', text: 'A SLSA-style statement, signed, generated by this pipeline itself. It is not a GitLab-native SLSA Level 3 attestation and no SLSA level is claimed.' }));
      el.appendChild(kv([
        ['Statement type', mono(st2._type || 'not recorded')], ['Predicate type', mono(st2.predicateType || 'not recorded')],
        ['Subject', subj.name ? mono(subj.name) : 'not recorded'], ['Subject digest', subj.digest && subj.digest.sha256 ? monoCopy(subj.digest.sha256, 'subject digest') : 'not recorded'],
        ['Build type', mono(pr.buildType || 'not recorded')], ['Builder', (pr.builder && pr.builder.id) ? mono(pr.builder.id) : 'not recorded'],
        ['Source commit', pr.invocation && pr.invocation.environment ? mono(pr.invocation.environment.commit || 'not recorded') : 'not recorded'],
        ['Signature', run.signature.provenance && run.signature.provenance.rekor ? ext(run.signature.provenance.rekor.url, 'Rekor #' + run.signature.provenance.rekor.log_index) : 'not recorded']]));
    } else el.appendChild(empty('No provenance statement recorded for this run.'));
    return el;
  }
  function agentsTab(run) {
    var el = h('div', {}), m = run.mr && run.mr.kind === 'mr' ? run.mr.iid : null;
    var item = m ? ((DATA.duo || {}).items || []).filter(function (i) { return i.mr_iid === m; })[0] : null;
    if (!item) {
      el.appendChild(empty('No agent assessment for this run.', m ? 'The Impact Analyst has not assessed !' + m + ' in the records. It runs automatically when a merge request is created; open an MR without mentioning anyone to produce one.' : 'Impact Analyst assessments are made for merge requests. This run is not on a merge request.'));
      return el;
    }
    el.appendChild(h('p', { class: 'sub', text: 'Agents advise, the Witness decides, people release. The Witness recomputes scope, risk and required evidence from the changed paths and keeps the stricter result.' }));
    el.appendChild(kv([
      ['Merge request', ext(DATA.project_url + '/-/merge_requests/' + m, '!' + m)],
      ['Scope', (item.witness_scope || []).join(', ') + (item.scope_differs ? ' (Duo said ' + (item.duo_scope || []).join(', ') + ')' : ' (Duo and the Witness agree)')],
      ['Risk', 'Duo said ' + (item.duo_risk || 'nothing') + '; the Witness says ' + item.witness_risk + (item.risk_result === 'agreed' ? ' (agreed)' : item.risk_result === 'witness_stricter' ? ' (the Witness is stricter)' : ' (Duo was higher; the higher rating is kept)')],
      ['Required evidence', item.evidence_witness_added.length ? 'The Witness added ' + item.evidence_witness_added.join(', ') : 'Agreed'],
      ['Session', item.session_url ? ext(item.session_url, (item.session_flow || 'Impact Analyst') + ' session ' + item.session_url.split('/').pop()) : 'not recorded']
    ]));
    return el;
  }
  function filesTab(run) {
    var el = h('div', {}), links = run.evidence_links || [];
    var evidencePage = run.has_decision ? h('p', {}, [link('runs/' + run.id + '/', 'Open the static evidence page for this run'), ' (it works without this dashboard).']) : null;
    el.appendChild(evidencePage);
    if (!links.length) { el.appendChild(empty('No evidence files were retained for this run.')); return el; }
    el.appendChild(h('p', { class: 'sub', text: 'Each file has a saved copy in the repository that opens in the browser, and the live GitLab artifact that downloads. Compare them to check the numbers above.' }));
    el.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 't stack' }, [
      h('thead', {}, [h('tr', {}, [h('th', { text: 'File' }), h('th', { text: 'Saved copy' }), h('th', { text: 'Live GitLab artifact' })])]),
      h('tbody', {}, (run.model_card ? [{ label: 'Model card (generated here from the records)', file: 'model-card.md', model_card: true }] : []).concat(links).map(function (l) {
        if (l.model_card) return h('tr', {}, [h('td', { 'data-label': 'File' }, [h('b', { text: l.label }), h('div', { class: 'sub mono', text: l.file })]), h('td', { 'data-label': 'Saved copy' }, [h('a', { class: 'btn', href: run.model_card, target: '_blank', rel: 'noopener', text: 'View' })]), h('td', { 'data-label': 'Live artifact' }, [h('span', { class: 'muted', text: 'Not an artifact' })])]);
        return h('tr', {}, [
          h('td', { 'data-label': 'File' }, [h('b', { text: l.label }), h('div', { class: 'sub mono', text: l.file })]),
          h('td', { 'data-label': 'Saved copy' }, [l.view_url ? h('a', { class: 'btn', href: l.view_url, target: '_blank', rel: 'noopener', text: 'View' }) : h('span', { class: 'muted', text: 'No saved copy' })]),
          h('td', { 'data-label': 'Live artifact' }, [h('a', { class: 'btn primary', href: l.url, target: '_blank', rel: 'noopener', title: 'Live GitLab artifact, job ' + l.job_id + '. It downloads the file.', text: 'Download' })])]);
      }))])]));
    return el;
  }

  // chain of custody as lanes: solid = happened, dashed = recorded only (mock) or not yet recorded
  function custodyTab(run) {
    var el = h('div', {}), c = chainFor(run);
    el.appendChild(h('div', { class: 'legend' }, [h('span', {}, [h('i'), 'Happened']), h('span', {}, [h('i', { class: 'd' }), 'Recorded only, or not yet recorded'])]));
    var N = c ? 8 : 5, events = [];
    function ev(lane, col, tone, title, sub, href, external) { events.push({ lane: lane, col: col, tone: tone, title: title, sub: sub, href: href, external: external }); }
    var blocked = c ? BYID[c.blocked_run] : (run.outcome === 'expected_block' || run.outcome === 'unexpected_block' ? run : null);
    if (c) {
      var b = BYID[c.blocked_run], co = c.corrected_run ? BYID[c.corrected_run] : null, rl = c.release_run ? BYID[c.release_run] : null;
      ev('Pipeline', 1, 'pass', 'Pipeline ' + b.id + ' ran', fmtTime(b.created_at), '#/releases/' + b.id);
      ev('Witness', 1, 'fail', 'Blocked: ' + ((c.blocked_reasons || [])[0] || 'no code'), c.blocked_cause ? c.blocked_cause.text : '', '#/releases/' + b.id);
      ev('Duo agents', 2, c.issue ? 'pass' : 'pending', c.issue ? 'Investigation issue #' + c.issue.iid : 'No investigation recorded', c.issue && c.issue.session_url ? 'Release Investigator session ' + c.issue.session_url.split('/').pop() : '', c.issue ? c.issue.web_url : null, true);
      ev('Duo agents', 3, c.repair_mr ? 'pass' : 'pending', c.repair_mr ? 'Repair merge request !' + c.repair_mr.iid : 'No repair merge request', c.repair_mr && c.repair_mr.session_url ? 'Release Repair session ' + c.repair_mr.session_url.split('/').pop() : '', c.repair_mr ? c.repair_mr.web_url : null, true);
      var appr = c.repair_mr && c.repair_mr.approved_by && c.repair_mr.approved_by.length ? c.repair_mr.approved_by : null;
      ev('People', 4, appr ? 'pass' : 'pending', appr ? 'Approved by @' + appr.join(', @') : 'No approval record', appr && c.repair_mr.approved_by.indexOf((MRS[c.repair_mr.iid] && MRS[c.repair_mr.iid].author || {}).username) >= 0 ? 'Self-approval: single-member demo project' : '');
      ev('People', 5, c.repair_mr && c.repair_mr.merged_by ? 'pass' : 'pending', c.repair_mr && c.repair_mr.merged_by ? 'Merged by @' + c.repair_mr.merged_by : 'Not merged', c.promotion_mr ? 'Promoted by !' + c.promotion_mr.iid : '');
      ev('Pipeline', 6, co ? 'pass' : 'pending', co ? 'Corrected pipeline ' + co.id : 'No corrected pipeline', co ? fmtTime(co.created_at) : '', co ? '#/releases/' + co.id : null);
      ev('Witness', 6, co && co.outcome === 'released_eligible' ? 'pass' : 'pending', co ? decision(co).label : 'Not decided', '', co ? '#/releases/' + co.id : null);
      if (rl && policyChange(rl)) ev('People', 6, policyChange(rl).status === 'approved' ? 'pass' : 'attn', policyChange(rl).status === 'approved' ? 'Policy change approved by @' + policyChange(rl).approved_by : 'Held: policy change needs review', (policyChange(rl).changed_paths || []).join(', '), policyChange(rl).approve_job_url, true);
      ev('Pipeline', 7, c.signed ? 'pass' : 'pending', c.signed ? 'Evidence signed (Rekor)' : 'Not signed', rl ? 'Pipeline ' + rl.id : '', rl ? '#/releases/' + rl.id + '/signature' : null);
      var mock = !!(c.deployment && c.deployment.mock);
      ev('People', 7, c.release_started_by ? (mock ? 'mock' : 'pass') : 'pending', c.release_started_by ? 'Release started by @' + c.release_started_by : 'Release not started', c.release_started_by && mock ? 'Recorded only: no service was deployed' : '');
      ev('Pipeline', 8, c.release_stage === 'artifact_verified' || c.release_stage === 'runtime_verified' ? 'pass' : 'pending', c.release_stage === 'artifact_verified' || c.release_stage === 'runtime_verified' ? 'Runtime digest check passed' : 'No runtime check', c.release_stage === 'artifact_verified' ? 'Published model matches the signed evidence' : '');
    } else {
      ev('Pipeline', 1, 'pass', 'Pipeline ' + run.id + ' ran', fmtTime(run.created_at), run.web_url, true);
      ev('Witness', 2, decision(run).tone === 'pending' ? 'pending' : (blocked ? 'fail' : 'pass'), run.has_decision ? decision(run).label : 'No decision', (run.reason_codes || []).join(', '));
      if (policyChange(run)) ev('People', 3, policyChange(run).status === 'approved' ? 'pass' : 'attn', policyChange(run).status === 'approved' ? 'Policy change approved by @' + policyChange(run).approved_by : 'Held: policy change needs review', (policyChange(run).changed_paths || []).join(', '), policyChange(run).approve_job_url, true);
      ev('Pipeline', 3, isSigned(run) ? 'pass' : 'pending', isSigned(run) ? 'Evidence signed (Rekor)' : 'Not signed', '');
      var m2 = !!(run.deployment && run.deployment.mock);
      ev('People', 4, run.deploy_job_user ? (m2 ? 'mock' : 'pass') : 'pending', run.deploy_job_user ? 'Release started by @' + run.deploy_job_user : (run.outcome === 'released_eligible' ? 'Release not started' : 'No release'), run.deploy_job_user && m2 ? 'Recorded only: no service was deployed' : '');
      ev('Pipeline', 5, run.release_stage === 'artifact_verified' || run.release_stage === 'runtime_verified' ? 'pass' : 'pending', run.release_stage === 'artifact_verified' || run.release_stage === 'runtime_verified' ? 'Runtime digest check passed' : 'No runtime check', '');
    }
    el.appendChild(h('p', { class: 'sub', text: c ? 'The chain this run belongs to, from the blocked pipeline to the release. ' + c.steps_done + ' of ' + c.steps_total + ' steps have a record' + (c.missing.length ? '; missing: ' + c.missing.join(', ').replace(/_/g, ' ') + '.' : '.') : 'This run is not part of an investigated block, so only its own events are shown.' }));
    var lanes = h('div', { class: 'lanes' });
    ['Witness', 'Duo agents', 'People', 'Pipeline'].forEach(function (lane) {
      var evs = h('div', { class: 'evs', style: '--n:' + N });
      for (var col = 1; col <= N; col++) {
        var e = events.filter(function (x) { return x.lane === lane && x.col === col; })[0];
        if (!e) { evs.appendChild(h('div', { class: 'ev none', 'aria-hidden': 'true' })); continue; }
        function soft(t) { return (t || '').replace(/[._]/g, function (ch) { return ch + '\u200b'; }); }
        var etitle = soft(e.title), esub = soft(e.sub);
        var title = e.href ? (e.href.charAt(0) === '#' ? link(e.href, etitle) : ext(e.href, etitle)) : document.createTextNode(etitle);
        evs.appendChild(h('div', { class: 'ev ' + e.tone }, [h('b', {}, [title]), esub ? h('span', { class: 'sub', text: esub }) : null]));
      }
      lanes.appendChild(h('div', { class: 'lane' }, [h('div', { class: 'ln', text: lane }), evs]));
    });
    el.appendChild(lanes);
    return el;
  }

  function attestation(run) {
    var sig = run.signature && run.signature.evidence, d = decision(run);
    var el = h('section', { class: 'attest' }, [h('h1', { text: 'Release attestation' }),
      h('p', { text: 'Gasket compared the model in the release image with the model the evaluation evidence was produced for. Synthetic data, demo policy.' }),
      kv([['Pipeline', String(run.id)], ['Commit', mono(run.sha || 'not recorded')], ['Time', fmtTime(run.created_at)], ['Decision', d.label + ((run.reason_codes || []).length ? ' (' + run.reason_codes.join(', ') + ')' : '')],
        ['Accuracy', run.metrics && run.metrics.accuracy != null ? num(run.metrics.accuracy) + ' (minimum ' + (run.thresholds || {}).minimum_accuracy + ')' : 'not recorded'],
        ['Fairness gap', run.metrics && run.metrics.fairness_gap != null ? num(run.metrics.fairness_gap) + ' (maximum ' + (run.thresholds || {}).maximum_fairness_gap + ')' : 'not recorded'],
        ['Signature', isSigned(run) ? 'Signed with Sigstore keyless signing, Rekor entry ' + sig.rekor.log_index + '. It proves origin and integrity, not that a person reviewed the result.' : 'Not signed'],
        ['Release', run.deploy_job_user ? 'Release job started by @' + run.deploy_job_user + (run.deployment && run.deployment.mock ? '; recorded only, no service deployed' : '') : 'Not started']]),
      run.seal ? sealPanel(run, { static: true }) : null,
      isSigned(run) ? h('p', {}, ['Verify: ', mono(sig.verify_command)]) : null,
      h('p', { class: 'sub', text: 'Snapshot ' + fmtTime(DATA.generated_at) + '. This page explains the Witness\'s decision; it does not make it.' })]);
    return el;
  }

  function casePage(id, tab) {
    var run = BYID[id], main = h('div', {});
    if (!run) { main.appendChild(pagehead('Release case file', 'This run is not in the snapshot.')); main.appendChild(link('#/releases', 'Back to releases')); return main; }
    var t = TABS.filter(function (x) { return x[0] === tab; })[0] ? tab : 'decision';
    var head = h('div', { class: 'case-head' }, [h('p', { class: 'sub' }, [link('#/releases', 'Releases'), ' / pipeline ' + run.id]),
      h('h1', { text: 'Release case file' }), h('p', {}, [decisionStatus(run)])]);
    main.appendChild(head);
    var info = mrInfo(run), rec = info.iid ? MRS[info.iid] : null;
    main.appendChild(h('div', { class: 'panel case-head' }, [kv([
      ['Pipeline', h('span', {}, [mono(String(run.id)), copyBtn(String(run.id), 'pipeline ID'), ' ', ext(run.web_url, 'Open in GitLab')])],
      ['Commit', h('span', {}, [mono((run.sha || '').slice(0, 12)), copyBtn(run.sha || '', 'commit'), h('div', { class: 'sub', text: changeText(run) })])],
      ['Merge request', mrCell(run, true)],
      rec && approvalText(rec) ? ['Approval', approvalText(rec)] : null,
      rec && rec.merged_by ? ['Merged by', '@' + rec.merged_by.username] : null,
      run.deploy_job_user ? ['Release job started by', '@' + run.deploy_job_user] : null,
      ['Triggered by', run.actor && run.actor.username ? '@' + run.actor.username : 'not recorded'],
      ['Time', fmtTime(run.created_at)]
    ])]));
    var tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Case file sections' }, TABS.map(function (x) {
      return h('a', { role: 'tab', href: '#/releases/' + run.id + '/' + x[0], 'aria-selected': x[0] === t ? 'true' : 'false', text: x[1], tabindex: x[0] === t ? '0' : '-1' });
    }));
    tabs.addEventListener('keydown', function (e) {
      var keys = { ArrowRight: 1, ArrowLeft: -1 }; if (!keys[e.key]) return;
      var i = TABS.map(function (x) { return x[0]; }).indexOf(t), next = TABS[(i + keys[e.key] + TABS.length) % TABS.length][0];
      location.hash = '#/releases/' + run.id + '/' + next; e.preventDefault();
    });
    main.appendChild(tabs);
    var panel = { decision: decisionTab, evidence: evidenceTab, signature: signatureTab, agents: agentsTab, custody: custodyTab, files: filesTab }[t](run);
    main.appendChild(h('div', { class: 'tabpanel', role: 'tabpanel' }, [panel]));
    var others = info.iid ? sortDesc(releaseRuns().filter(function (r) { return r.id !== run.id && mrInfo(r).key === info.key; })) : [];
    if (others.length) {
      var o = section('Other runs on this merge request', null); o.className += ' other-runs';
      o.appendChild(h('ul', {}, others.map(function (r) { return h('li', {}, [runLink(r, 'Pipeline ' + r.id), ' ', decisionStatus(r), ' ', h('span', { class: 'sub', text: fmtTime(r.created_at) })]); })));
      main.appendChild(o);
    }
    main.appendChild(attestation(run));
    return main;
  }

  // ---------------------------------------------------------------- agents
  var WRITE_PREFIXES = ['create_', 'update_', 'delete_', 'merge_', 'approve_'];
  function isWrite(tool) { return WRITE_PREFIXES.some(function (p) { return tool.indexOf(p) === 0; }); }
  function agentsPage() {
    var A = DATA.agents || { flows: [], counts: {} }, main = h('div', {});
    main.appendChild(pagehead('Agents', A.statement || 'Agents advise, the Witness decides, people release.'));
    var d = DATA.duo || {}, n = d.assessments || 0;
    if (n) {
      var of = function (k) { return k + ' of ' + n + (d.percentages_shown ? ' (' + Math.round(100 * k / n) + '%)' : ''); };
      var cats = Object.keys((d.evidence || {}).categories || {}).map(function (c) { return c + ' in ' + d.evidence.categories[c]; }).join(', ');
      main.appendChild(h('div', { class: 'panel' }, [h('h2', { text: 'Duo against the Witness' }), kv([
        ['Assessments recorded', String(n)],
        ['Risk level', 'Agreed ' + of(d.risk.agreed) + '; the Witness was stricter in ' + of(d.risk.witness_stricter) + '; looser in ' + of(d.risk.witness_looser)],
        ['Required evidence', 'Agreed ' + of(d.evidence.agreed) + '; the Witness added categories in ' + of(d.evidence.witness_added) + (cats ? ' (' + cats + ')' : '')]]),
        h('p', { class: 'sub', style: 'margin-top:10px', text: 'Why security and SBOM are added for a model change: the Witness requires accuracy, fairness, artifact identity, security and SBOM evidence for any change to model code, matching the release policy. The Impact Analyst is not told that mapping. Percentages appear only from 10 assessments.' })]));
    } else main.appendChild(empty('No Impact Analyst assessment is recorded yet.', 'It runs automatically when a merge request is created.'));
    A.flows.forEach(function (f) {
      var reads = f.tools.filter(function (t) { return !isWrite(t); }), writes = f.tools.filter(isWrite);
      var panel = h('div', { class: 'panel' }, [h('h2', { text: f.name }),
        kv([['Trigger', st(f.trigger === 'automatic' ? 'pass' : 'neutral', f.trigger === 'automatic' ? 'Automatic' : 'Mention only', f.why_trigger)], ['When', f.when], ['Service account', mono('@' + f.account)], ['What it does', f.does], ['Why this trigger', f.why_trigger]]),
        h('h3', { text: 'Tool permissions (least privilege)' }),
        kv([['Can read', reads.length ? mono(reads.join(', ')) : 'nothing'], ['Can write', writes.length ? mono(writes.join(', ')) : 'nothing'],
          ['Cannot', 'Approve, merge, deploy or change a Witness decision. None of those tools is granted.']]),
        h('h3', { text: 'Runs recorded (' + f.run_count + ')' })]);
      if (!f.runs.length) panel.appendChild(h('p', { class: 'muted', text: 'No run is recorded for this flow in the snapshot.' }));
      else panel.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 't stack' }, [h('thead', {}, [h('tr', {}, [h('th', { text: 'Subject' }), h('th', { text: 'Session' })])]),
        h('tbody', {}, f.runs.map(function (r) {
          return h('tr', {}, [h('td', { 'data-label': 'Subject' }, [ext(r.href, r.subject)]),
            h('td', { 'data-label': 'Session' }, [r.session_url ? ext(r.session_url, 'Session ' + r.session_url.split('/').pop()) : h('span', { class: 'muted', text: 'Session not recorded. Map it with scripts/import_sessions.py (docs/SETUP.md).' })])]);
        }))])]));
      main.appendChild(panel);
    });
    return main;
  }

  // ---------------------------------------------------------------- policy
  function policyPage() {
    var P = DATA.policy || {}, main = h('div', {});
    main.appendChild(pagehead('Policy', 'The rule the Witness applies to every release. These thresholds are this project\'s own demo rule, not a legal or regulatory standard.'));
    if (!P.available) { main.appendChild(empty('The policy file is not part of this snapshot.')); return main; }
    var th = P.thresholds || {};
    main.appendChild(h('div', { class: 'panel' }, [h('h2', { text: 'Current policy' }), kv([
      ['Policy', h('span', {}, [P.policy_id, ' ', ext(P.file_url, 'Open the file')])], ['Schema', mono(P.schema_version || 'not recorded')],
      ['File hash (SHA-256)', monoCopy(P.sha256, 'policy hash')], ['Fairness metric', mono(P.fairness_metric || 'not recorded')]])]));
    main.appendChild(h('div', { class: 'panel' }, [h('h2', { text: 'Thresholds' }), h('div', { class: 'tablewrap' }, [h('table', { class: 't' }, [
      h('thead', {}, [h('tr', {}, [h('th', { text: 'Check' }), h('th', { text: 'Limit' }), h('th', { text: 'Meaning' })])]),
      h('tbody', {}, [
        h('tr', {}, [h('td', { text: 'Accuracy' }), h('td', { class: 'nowrap', text: 'at least ' + th.minimum_accuracy }), h('td', { text: 'Measured on the fixed evaluation data, recomputed by the Witness.' })]),
        h('tr', {}, [h('td', { text: 'Fairness gap' }), h('td', { class: 'nowrap', text: 'at most ' + th.maximum_fairness_gap }), h('td', { text: 'Equal opportunity difference between the two groups. Needs at least ' + ((P.fairness || {}).minimum_positives_per_group || '?') + ' positives per group to be meaningful.' })])
      ])])]),
      h('p', { class: 'sub', style: 'margin-top:10px', text: 'Required checks: ' + (P.required_checks || []).join(', ') + '.' })]));
    var rv = P.review || {};
    main.appendChild(h('div', { class: 'panel' }, [h('h2', { text: 'Who can change it, and how a change is held' }), kv([
      ['Where changes happen', 'The policy is a file in the repository, so a change is a commit. Changes reach main through merge requests.'],
      ['Approval on merge requests', rv.approvals_required ? 'The merge requests in the records require ' + rv.approvals_required + ' approval' + (rv.approvals_required > 1 ? 's' : '') + (rv.rules.length ? ' (rule: ' + rv.rules.join(', ') + ')' : '') + '. The project has one member, so approvals are self-approvals.' : 'No approval rule is recorded.'],
      ['What the Witness enforces', 'A release is blocked with ' + rv.witness_blocks_a_changed_policy + ' when the evidence was produced under a different policy than the one the Witness reads.'],
      ['What the Witness does not do', 'The Witness has no review check of its own and its decisions are unchanged. A change to the gate\'s own rules is held by a separate CI job instead (below).'],
      ['Preventive limit', P.guard_limit || 'not recorded']])]));
    if ((P.protected_paths || []).length) {
      main.appendChild(h('div', { class: 'panel' }, [h('h2', { text: 'Protected paths' }),
        h('p', { class: 'sub', text: 'A change to any of these is held with POLICY_CHANGE_REQUIRES_REVIEW until a person starts the manual job approve-policy-change. An AI agent cannot be that person. The list is policy/protected-paths.yml, itself on the list. Docs, the dashboard and tests are not on it.' }),
        h('ul', { class: 'plain' }, P.protected_paths.map(function (x) { return h('li', {}, [mono(x)]); }))]));
    }
    var pcs = h('div', { class: 'panel' }, [h('h2', { text: 'Policy changes held and approved' })]);
    if (!(P.policy_changes || []).length) pcs.appendChild(empty('No policy change has been recorded yet.', 'A pipeline that changes a protected path appears here with who approved it.'));
    else pcs.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 't stack' }, [h('thead', {}, [h('tr', {}, [h('th', { text: 'Pipeline' }), h('th', { text: 'Changed' }), h('th', { text: 'Status' }), h('th', { text: 'Diff (SHA-256)' })])]),
      h('tbody', {}, P.policy_changes.map(function (c) {
        return h('tr', {}, [h('td', { 'data-label': 'Pipeline' }, [link('#/releases/' + c.run, 'Pipeline ' + c.run), c.mr_iid ? h('div', { class: 'sub', text: '!' + c.mr_iid }) : null]),
          h('td', { 'data-label': 'Changed' }, [(c.paths || []).join(', ')]),
          h('td', { 'data-label': 'Status' }, [c.status === 'approved' ? st('pass', 'Approved by @' + c.approved_by, c.self_approval ? 'Self-approval: a separation-of-duties gap' : false) : st('attn', 'Held'), c.self_approval ? h('div', { class: 'sub', text: 'Self-approval' }) : null]),
          h('td', { 'data-label': 'Diff (SHA-256)' }, [mono((c.diff_sha256 || 'not recorded').slice(0, 16))])]);
      }))])]));
    main.appendChild(pcs);
    if ((P.guards || []).length) {
      main.appendChild(h('div', { class: 'panel' }, [h('h2', { text: 'Guard status' }), h('div', { class: 'tablewrap' }, [h('table', { class: 't stack' }, [
        h('thead', {}, [h('tr', {}, [h('th', { text: 'Guard' }), h('th', { text: 'Enforced' }), h('th', { text: 'Evidence' })])]),
        h('tbody', {}, P.guards.map(function (g) { return h('tr', {}, [h('td', { 'data-label': 'Guard', text: g.name }), h('td', { 'data-label': 'Enforced' }, [g.preventive ? h('span', {}, [st('pass', 'Enforced (preventive)'), h('div', {}, [st('pass', 'Audited (detective)')])]) : st(g.enforced ? 'pass' : 'fail', g.enforced ? 'Yes' : 'No')]), h('td', { 'data-label': 'Evidence', text: g.evidence })]); }))])])]));
    }
    var hist = h('div', { class: 'panel' }, [h('h2', { text: 'Change history' })]);
    if (!(P.history || []).length) hist.appendChild(empty('History is not available in this snapshot.', 'It is read from GitLab\'s commit records for the policy file when the snapshot is taken.'));
    else hist.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 't stack' }, [h('thead', {}, [h('tr', {}, [h('th', { text: 'Date' }), h('th', { text: 'Change' }), h('th', { text: 'Author' })])]),
      h('tbody', {}, P.history.map(function (c) { return h('tr', {}, [h('td', { 'data-label': 'Date' }, [fmtDay(c.date)]), h('td', { 'data-label': 'Change' }, [safeUrl(c.url) ? ext(c.url, c.title) : c.title]), h('td', { 'data-label': 'Author' }, [c.author || 'not recorded'])]); }))])]));
    main.appendChild(hist);
    if ((P.classification_changes || []).length) {
      main.appendChild(h('div', { class: 'panel' }, [h('h2', { text: 'Changes to how changes are classified' }),
        h('p', { class: 'sub', text: 'These are not policy file commits. They change which evidence a merge request needs, and are recorded in the Gasket source.' }),
        h('div', { class: 'tablewrap' }, [h('table', { class: 't stack' }, [h('thead', {}, [h('tr', {}, [h('th', { text: 'Date' }), h('th', { text: 'Change' })])]),
          h('tbody', {}, P.classification_changes.map(function (c) { return h('tr', {}, [h('td', { 'data-label': 'Date' }, [fmtDay(c.date)]), h('td', { 'data-label': 'Change' }, [c.change])]); }))])])]));
    }
    return main;
  }

  // ---------------------------------------------------------------- controls
  function controlsPage() {
    var C = DATA.controls || { items: [] }, main = h('div', {});
    main.appendChild(pagehead('Controls', C.disclosure));
    var rows = C.items.map(function (c) {
      var tone = c.status === 'Operating' ? 'pass' : (c.status === 'Partly met' ? 'attn' : 'pending');
      return h('tr', {}, [
        h('td', { 'data-label': 'Control' }, [h('b', { text: c.name }), h('div', { class: 'sub', text: c.does })]),
        h('td', { 'data-label': 'Status' }, [st(tone, c.status), h('div', { class: 'sub', text: c.status_detail })]),
        h('td', { 'data-label': 'Evidence' }, [c.evidence ? (c.evidence.external ? ext(c.evidence.href, c.evidence.label) : link(c.evidence.href, c.evidence.label)) : h('span', { class: 'muted', text: 'None yet' })]),
        h('td', { 'data-label': 'Framework themes' }, [kv([['NIST AI RMF', c.nist], ['SR 11-7', c.sr117], ['ISO/IEC 42001', c.iso], ['SLSA', c.slsa]])])]);
    });
    main.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 't stack' }, [h('thead', {}, [h('tr', {}, ['Control', 'Status', 'Evidence', 'Framework themes'].map(function (t) { return h('th', { text: t }); }))]), h('tbody', {}, rows)])]));
    var cov = DATA.coverage || [];
    if (cov.length) {
      var sec2 = section('GitLab features used', 'Only stages that actually ran are listed; each links to its real GitLab page.');
      sec2.appendChild(h('ul', {}, cov.map(function (i) { return h('li', {}, [ext(i.url, i.label), h('span', { class: 'sub', text: ' ' + i.evidence })]); })));
      main.appendChild(sec2);
    }
    main.appendChild(h('p', { class: 'sub', style: 'margin-top:14px' }, [ext(DATA.project_url + '/-/blob/main/docs/CONTROLS.md', 'Read the mapping in docs/CONTROLS.md')]));
    return main;
  }

  // ---------------------------------------------------------------- models
  function modelsPage() {
    var main = h('div', {}), models = DATA.models || [];
    main.appendChild(pagehead('Models', 'Each model file the gate has seen, identified by its SHA-256, with its latest decision.'));
    if (!models.length) { main.appendChild(empty('No model has been recorded.')); return main; }
    var rows = models.map(function (m) {
      var runs = RUNS.filter(function (r) { return r.evidenced_model_sha256 === m.sha256 && r.has_decision; }), latest = runs.length ? newest(runs) : null;
      var pkg = RUNS.filter(function (r) { return r.deployment && r.deployment.published_artifact && r.deployment.published_artifact.sha256 === m.sha256; });
      var mt = m.metrics || {};
      return h('tr', {}, [
        h('td', { 'data-label': 'Model' }, [monoCopy(m.sha256, 'model hash'), h('div', { class: 'sub', text: 'Variant ' + ((m.variants || []).join(', ') || 'not recorded') })]),
        h('td', { 'data-label': 'Accuracy', class: 'num' }, [mt.accuracy != null ? num(mt.accuracy) : 'not evaluated']),
        h('td', { 'data-label': 'Fairness gap', class: 'num' }, [mt.fairness_gap != null ? num(mt.fairness_gap) : 'not evaluated']),
        h('td', { 'data-label': 'Latest decision' }, [latest ? h('span', {}, [decisionStatus(latest), h('div', { class: 'sub' }, [runLink(latest, 'Pipeline ' + latest.id)])]) : h('span', { class: 'muted', text: 'No decision' })]),
        h('td', { 'data-label': 'Runs', class: 'num' }, [String(m.runs)]),
        h('td', { 'data-label': 'Package' }, [pkg.length ? ext(DATA.project_url + '/-/packages', 'Package registry') : h('span', { class: 'muted', text: 'Not published' })])]);
    });
    main.appendChild(h('div', { class: 'tablewrap' }, [h('table', { class: 't stack' }, [h('thead', {}, [h('tr', {}, ['Model', 'Accuracy', 'Fairness gap', 'Latest decision', 'Runs', 'Package'].map(function (t) { return h('th', { text: t }); }))]), h('tbody', {}, rows)])]));
    return main;
  }

  // A stacked (mobile) table row lays each cell out as label + one content block, so a cell with several children is wrapped in one block.
  function wrapCells(root) {
    root.querySelectorAll('table.stack td').forEach(function (td) {
      if (td.childNodes.length > 1) { var d = document.createElement('div'); while (td.firstChild) d.appendChild(td.firstChild); td.appendChild(d); }
    });
  }

  // ---------------------------------------------------------------- shell: header, navigation, routes
  var ROUTES = [['overview', 'Overview'], ['releases', 'Releases'], ['agents', 'Agents'], ['policy', 'Policy'], ['controls', 'Controls'], ['models', 'Models']];
  function parseRoute() {
    var raw = (location.hash || '#/overview').replace(/^#\/?/, ''), qs = '';
    if (raw.indexOf('?') >= 0) { qs = raw.slice(raw.indexOf('?') + 1); raw = raw.slice(0, raw.indexOf('?')); }
    var parts = raw.split('/'), q = {};
    qs.split('&').forEach(function (p) { if (!p) return; var kv2 = p.split('='); q[decodeURIComponent(kv2[0])] = decodeURIComponent((kv2[1] || '').replace(/\+/g, ' ')); });
    var name = parts[0] || 'overview';
    // older links keep working
    if (name === 'runs') name = 'releases';
    if (name === 'run') { name = 'releases'; }
    if (name === 'duo') name = 'agents';
    if (name === 'people') name = 'overview';
    return { name: name, id: parts[1] ? Number(parts[1]) : null, tab: parts[2] || null, q: q };
  }
  // Whether the published snapshot data and proof chain are signed: read from snapshot-signature.js, written by the publishing pipeline.
  function snapshotSignature() {
    var sig = window.GASKET_SNAPSHOT_SIGNATURE;
    var signed = !!(sig && sig.snapshot && sig.snapshot.signed && sig.proof_chain && sig.proof_chain.signed);
    var box = h('div', {});
    if (signed) {
      box.appendChild(h('p', {}, [st('pass', 'Snapshot data signed', 'Signed with Sigstore keyless signing by the publishing pipeline.')]));
      box.appendChild(kv([
        ['Snapshot data', h('span', {}, [h('a', { href: 'snapshot.json', text: 'snapshot.json' }), ' ', ext(sig.snapshot.rekor.url, 'Rekor entry #' + sig.snapshot.rekor.log_index)])],
        ['Proof chain', h('span', {}, [h('a', { href: 'proof-chain.json', text: 'proof-chain.json' }), ' ', ext(sig.proof_chain.rekor.url, 'Rekor entry #' + sig.proof_chain.rekor.log_index)])],
        ['Verify the snapshot', monoCopy(sig.snapshot.verify_command, 'verify command')],
        ['Verify the proof chain', monoCopy(sig.proof_chain.verify_command, 'verify command')]]));
      box.appendChild(h('p', { class: 'sub', text: 'Download both files and their .cosign.bundle files into one folder, then run the commands. A signature proves these files came from the publishing pipeline unaltered; it does not prove the data in them is correct.' }));
    } else {
      box.appendChild(h('p', {}, [st('pending', 'Snapshot data not signed')]));
      box.appendChild(h('p', { class: 'sub', text: 'The snapshot and the proof chain are signed when the public dashboard is published from a GitLab pipeline with a Sigstore identity. This copy was not signed, so it is only as trustworthy as where you got it. Each run still links to its own signed evidence.' }));
    }
    return box;
  }
  function drawSnapshot() {
    var el = document.getElementById('snap'); if (!el) return; el.textContent = '';
    var q = DATA.data_quality || {};
    el.appendChild(h('summary', { text: (DATA.snapshot ? 'Snapshot ' : 'Data as of ') + fmtTime(DATA.generated_at) + (DATA.snapshot && DATA.snapshot.refresh === 'daily' ? '. Refreshed daily' : '') }));
    el.appendChild(h('div', { class: 'pop' }, [
      h('p', { text: DATA.snapshot ? 'A static snapshot, not live data. Every value comes from evidence files saved at this time from the GitLab project. Each run has links to the saved copy and to the live artifact so you can compare.' : 'Collected from GitLab pipelines and job artifacts.' }),
      DATA.snapshot ? h('p', {}, [ext(DATA.snapshot.project_url, 'Open the GitLab project')]) : null,
      DATA.snapshot ? snapshotSignature() : null,
      h('p', { class: 'sub', text: (q.valid_runs || 0) + ' runs with a decision are analysed. ' + (q.no_decision || 0) + ' have no retained Witness artifact; ' + (q.out_of_scope || 0) + ' pipelines are not release runs (Duo flows, dashboard refreshes, test probes). Counts are pipeline runs, so repeats are included. Synthetic data.' })]));
  }
  function render(data) {
    DATA = data; RUNS = data.runs || []; CHAINS = data.chains || [];
    RUNS.forEach(function (r) { BYID[r.id] = r; });
    ((data.work || {}).merge_requests || []).forEach(function (m) { MRS[m.iid] = m; });
    var tt = document.getElementById('theme-toggle');
    if (tt) tt.addEventListener('click', function () {
      var root = document.documentElement, cur = root.getAttribute('data-theme');
      var dark = cur === 'dark' || (!cur && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches), next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next); try { localStorage.setItem('gasket-theme', next); } catch (e) { /* the theme still switches for this visit */ }
    });
    var nt = document.getElementById('nav-toggle');
    if (nt) nt.addEventListener('click', function () { var open = document.body.classList.toggle('nav-open'); nt.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    drawSnapshot();
    var side = document.getElementById('side'), app = document.getElementById('app'), first = true;
    function draw() {
      var route = parseRoute();
      side.textContent = '';
      var nav = h('nav', { 'aria-label': 'Gasket sections' });
      ROUTES.forEach(function (r) { nav.appendChild(h('a', { href: '#/' + r[0], class: 'nav' + (r[0] === route.name ? ' active' : ''), 'aria-current': r[0] === route.name ? 'page' : false, text: r[1] })); });
      side.appendChild(nav); side.appendChild(h('div', { class: 'sidehead', text: 'In GitLab' }));
      side.appendChild(h('nav', { 'aria-label': 'GitLab links' }, [
        ext(DATA.project_url, 'Repository', 'nav'), ext(DATA.project_url + '/-/pipelines', 'Pipelines', 'nav'),
        ext(DATA.project_url + '/-/merge_requests', 'Merge requests', 'nav'), ext(DATA.project_url + '/-/environments', 'Environments', 'nav')]));
      side.appendChild(h('p', { class: 'sidenote', text: 'This dashboard is read-only. Starting pipelines and releasing happen in GitLab.' }));
      app.textContent = ''; document.body.classList.remove('nav-open');
      var page;
      if (route.name === 'releases') page = route.id ? casePage(route.id, route.tab) : releasesPage(route.q);
      else if (route.name === 'agents') page = agentsPage();
      else if (route.name === 'policy') page = policyPage();
      else if (route.name === 'controls') page = controlsPage();
      else if (route.name === 'models') page = modelsPage();
      else page = overview(route.q);
      app.appendChild(page);
      wrapCells(app);
      app.appendChild(h('footer', {}, [h('p', { text: 'Synthetic data and a demo policy. This dashboard explains the Witness\'s decisions; it does not make them.' })]));
      document.title = 'Gasket release proof: ' + (ROUTES.filter(function (r) { return r[0] === route.name; })[0] || ROUTES[0])[1];
      if (!first) { window.scrollTo(0, 0); app.focus({ preventScroll: true }); }
      first = false;
    }
    window.addEventListener('hashchange', draw);
    draw();
    if (DATA.snapshot) {
      var sigScript = document.createElement('script'); sigScript.src = 'snapshot-signature.js';
      sigScript.onload = function () { drawSnapshot(); draw(); };      // absent when the snapshot was not signed: nothing to do
      document.head.appendChild(sigScript);
    }
  }

  // Data baked into the page (data.js) needs no request, so it also works from disk or any static host.
  if (window.GASKET_DATA) render(window.GASKET_DATA);
  else fetch('data.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(render)
    .catch(function (err) { var app = document.getElementById('app'); app.textContent = ''; app.appendChild(empty('Could not load data.json (' + err.message + ').', 'The per-run evidence pages under runs/ are still available.')); });
})();
