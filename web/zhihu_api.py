"""Official Zhihu discovery adapter and verified public-answer snapshots.
Only server-side credentials; endpoints and case queries are fixed.
"""
import json
import os
import re
import time
import threading
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

BASE = 'https://developer.zhihu.com'
CACHE = Path(__file__).resolve().parent / '.data' / 'robotaxi.json'
LOCK = threading.Lock()
LAST_ATTEMPT = 0
QUERIES = ['萝卜快跑 无人驾驶 出行 技术', '萝卜快跑 司机 就业 推广']
# Calendar year 2024, China Standard Time. Search API EditTime maps to publication time.
START, END = 1704038400, 1735660799
TOPICS = {t['id']: t for t in json.loads((Path(__file__).parent / 'cases' / 'catalog.json').read_text())}
ATTEMPTS = {}
LOCKS = {id: threading.Lock() for id in TOPICS}

def get_topic(topic_id='robotaxi'):
    if not isinstance(topic_id, str) or topic_id not in TOPICS:
        raise APIError('未知话题。', 400)
    return TOPICS[topic_id]

def cache_path(topic_id):
    get_topic(topic_id)
    return CACHE if topic_id == 'robotaxi' else CACHE.with_name(topic_id + '.json')

class APIError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def secret():
    value = os.environ.get('ZHIHU_ACCESS_SECRET', '').strip()
    if value:
        return value
    path = Path(os.environ.get('ZHIHU_SECRET_FILE', '/tmp/zhihu-probe/.secret'))
    try:
        return path.read_text().strip()
    except OSError:
        return ''

def request(path, params=None, payload=None):
    key = secret()
    if not key:
        raise APIError('尚未配置知乎 Access Secret；当前为案例演练，未获取知乎回答。', 503)
    url = BASE + path + ('?' + urlencode(params) if params else '')
    req = Request(url, data=json.dumps(payload, ensure_ascii=False).encode() if payload else None,
                  headers={'Authorization': 'Bearer ' + key, 'X-Request-Timestamp': str(int(time.time())),
                           'Content-Type': 'application/json'})
    try:
        with build_opener(NoRedirect()).open(req, timeout=55) as response:
            result = json.load(response)
    except HTTPError as error:
        status = error.code
        if status in (401, 403):
            raise APIError('知乎鉴权或授权失败，请检查 Access Secret 与接口权限。', 401) from None
        if status == 429:
            raise APIError('知乎请求频率或额度受限，请稍后再试。', 429) from None
        raise APIError('知乎接口暂时不可用，已保留上次材料。') from None
    except (URLError, ValueError, TimeoutError, OSError):
        raise APIError('知乎接口连接失败，已保留上次材料。') from None
    if not isinstance(result, dict):
        raise APIError('知乎返回格式异常。')
    code = result.get('Code', 0)
    if code != 0:
        messages = {10001: ('知乎请求参数无效。', 400), 20001: ('知乎鉴权或授权失败。', 401),
                    30001: ('知乎频率或当日额度受限。', 429), 30002: ('知乎累计额度已用完。', 429),
                    30003: ('知乎拒绝本次请求，请检查平台授权状态。', 403)}
        message, status = messages.get(code, ('知乎服务暂时不可用。', 502))
        raise APIError(message, status)
    return result

def plain(value):
    return unescape(re.sub(r'<[^>]*>', '', str(value or ''))).strip()

def safe_url(value, domains):
    parsed = urlparse(str(value or ''))
    return str(value) if parsed.scheme == 'https' and not parsed.username and any(
        parsed.hostname == d or (parsed.hostname or '').endswith('.' + d) for d in domains) else ''

def normalize(item, topic_id='robotaxi'):
    topic = get_topic(topic_id)
    if not isinstance(item, dict) or str(item.get('ContentType', '')).lower() != 'answer':
        return None
    url = safe_url(item.get('Url'), ['zhihu.com'])
    # Some search responses use a signed index hash as ContentID. The canonical
    # answer URL carries the actual answer token used for deduplication.
    match = re.search(r'/answer/(\d+)', urlparse(url).path)
    token = match.group(1) if match else ''
    text, title = plain(item.get('ContentText')), plain(item.get('Title'))
    try:
        published = int(item.get('EditTime', 0))
    except (ValueError, TypeError):
        return None
    if not url or not token.isdigit() or not 30 <= len(text):
        return None
    if topic_id == 'robotaxi':
        if not START <= published <= END or '萝卜快跑' not in title + text:
            return None
    elif topic['questionIds']:
        question_match = re.search(r'/question/(\d+)(?:/|$)', urlparse(url).path)
        if not question_match or question_match.group(1) not in topic['questionIds']:
            return None
    elif not any(word in title + text for word in topic['keywords']):
        return None
    return {'topicId': topic_id, 'id': 'zhihu-' + token, 'answerId': token, 'author': plain(item.get('AuthorName')) or '知乎用户',
            'avatar': safe_url(item.get('AuthorAvatar'), ['zhimg.com']), 'bio': plain(item.get('AuthorBadgeText')) or '知乎答主',
            'body': text, 'contentStatus': 'excerpt', 'questionTitle': title, 'url': url, 'published': published,
            'source': '知乎 API · 回答摘要', 'sourceKind': 'zhihu',
            'context': topic['period'] + ' · API 回答摘要，不代表全文；请核对原回答上下文。',
            'claim': text[:160] + ('…' if len(text) > 160 else ''),
            'question': '这份材料适用于什么条件？还需要哪些证据？',
            'exampleRelation': 'unknown', 'reason': '来源真实不等于关系已确认，请阅读后判断。'}

def normalize_question_answer(item, topic_id, question_id):
    """question_answers has a different contract and does not promise author fields."""
    topic = get_topic(topic_id)
    if not isinstance(item, dict) or item.get('ContentType') != 'answer':
        return None
    token = str(item.get('ContentToken', ''))
    url = safe_url(item.get('Url'), ['zhihu.com'])
    text = plain(item.get('Summary'))
    match = re.fullmatch(r'(?:/question/(\d+))?/answer/(\d+)/?', urlparse(url).path)
    if not token.isdigit() or not url or not text or not match or match.group(2) != token:
        return None
    if match.group(1) and match.group(1) != question_id:
        return None
    return {'topicId': topic_id, 'id': 'zhihu-' + token, 'answerId': token,
            'author': '作者信息未提供', 'avatar': '', 'bio': '请在原回答查看作者',
            'body': text, 'contentStatus': 'excerpt', 'questionTitle': topic['title'], 'url': url,
            'source': '知乎 API · 回答摘要', 'sourceKind': 'zhihu',
            'context': '本题回答摘要，不代表全文；作者与发表时间请查看原回答。',
            'claim': text[:160] + ('…' if len(text) > 160 else ''),
            'question': '这份材料适用于什么条件？还需要哪些证据？',
            'exampleRelation': 'unknown', 'reason': '请阅读材料后确认观点关系。'}

def cached(topic_id='robotaxi'):
    path = cache_path(topic_id)
    try:
        data = json.loads(path.read_text())
        if data.get('version') == 1 and data.get('topicId', 'robotaxi') == topic_id and isinstance(data.get('answers'), list):
            return with_originals(data, topic_id)
    except (OSError, ValueError, AttributeError):
        pass
    return {'version': 1, 'topicId': topic_id, 'answers': [], 'syncedAt': None, 'queries': []}

def with_originals(data, topic_id):
    """Discovery excerpts never replace the original answer the reader has."""
    originals = {a.get('answerId'): a for a in get_topic(topic_id)['answers'] if a.get('contentStatus') == 'full'}
    return dict(data, answers=[dict(originals.get(a.get('answerId'), a)) for a in data['answers']])

def sync(topic_id='robotaxi', force=False):
    global LAST_ATTEMPT
    topic = get_topic(topic_id)
    if type(force) is not bool:
        raise APIError('刷新参数无效。', 400)
    path = cache_path(topic_id)
    lock = LOCK if topic_id == 'robotaxi' else LOCKS[topic_id]
    if not lock.acquire(blocking=False):
        raise APIError('正在同步，请等待本次完成。', 409)
    try:
        previous = cached(topic_id)
        if not force and previous.get('syncedAt') and time.time() - previous['syncedAt'] < 86400:
            return dict(previous, fromCache=True)
        if not secret():
            raise APIError('尚未配置知乎 Access Secret；预设案例继续保留，暂不能获取新回答。', 503)
        if time.time() - (LAST_ATTEMPT if topic_id == 'robotaxi' else ATTEMPTS.get(topic_id, 0)) < 60:
            raise APIError('请勿重复同步，一分钟后再试。', 429)
        if topic_id == 'robotaxi': LAST_ATTEMPT = time.time()
        else: ATTEMPTS[topic_id] = time.time()
        found, hashes, queries, calls = {}, [], [], 0
        source = 'question_answers' if topic['questionIds'] else 'zhihu_search'
        if source == 'question_answers':
            question_id = topic['questionIds'][0]
            question_url = 'https://www.zhihu.com/question/' + question_id
            offset, seen_offsets = 0, set()
            for _ in range(2):
                seen_offsets.add(str(offset))
                result = request('/api/v1/content/question_answers',
                                 {'QuestionUrl': question_url, 'Offset': offset, 'Limit': 10})
                calls += 1
                data = result.get('Data')
                if not isinstance(data, dict) or not isinstance(data.get('Items'), list):
                    raise APIError('知乎问题回答响应结构不完整。')
                for item in data['Items']:
                    normalized = normalize_question_answer(item, topic_id, question_id)
                    if normalized:
                        found.setdefault(normalized['answerId'], normalized)
                paging = data.get('Paging')
                if not isinstance(paging, dict) or type(paging.get('IsEnd')) is not bool:
                    raise APIError('知乎分页信息不完整，已保留原材料。')
                if paging['IsEnd'] or len(found) >= 6:
                    break
                next_offset = paging.get('NextOffset')
                if isinstance(next_offset, bool) or not str(next_offset).isdigit() or str(next_offset) in seen_offsets:
                    raise APIError('知乎分页游标无效，已停止继续请求。')
                offset = next_offset
            queries = [question_url]
        else:
            for query in dict.fromkeys(topic['queries'][:2]):
                params = {'Query': query, 'Count': 10}
                if topic_id == 'robotaxi': params['SortBy'] = f'EditTime:desc:({START},{END})'
                result = request('/api/v1/content/zhihu_search', params)
                calls += 1
                queries.append(query)
                data = result.get('Data')
                if not isinstance(data, dict) or not isinstance(data.get('Items'), list):
                    raise APIError('知乎搜索响应结构不完整。')
                hashes.append(data.get('SearchHashId', ''))
                for item in data['Items']:
                    normalized = normalize(item, topic_id)
                    if normalized:
                        found.setdefault(normalized['answerId'], normalized)
        if not found:
            raise APIError('本次未取得符合本题的有效回答，已保留预设案例和上次缓存。', 422)
        now = time.time()
        answers = list(found.values())[:6]
        for i, answer in enumerate(answers):
            answer.update(title=f'新观点 {i+1:02d}', retrieval=source,
                          captured=datetime.fromtimestamp(now, timezone.utc).strftime('%Y-%m-%d'))
        result = {'version': 1, 'topicId': topic_id, 'answers': answers, 'syncedAt': now, 'queries': queries, 'searchHashes': hashes,
                  'source': source, 'requestCount': calls, 'period': topic['period'], 'fromCache': False}
        result = with_originals(result, topic_id)
        path.parent.mkdir(exist_ok=True)
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(result, ensure_ascii=False, indent=2));temp.replace(path)
        return result
    finally:
        lock.release()

def completion(messages):
    model = os.environ.get('ZHIHU_MODEL', 'zhida-fast-1p5')
    if model not in ('zhida-fast-1p5', 'zhida-thinking-1p5'):
        raise APIError('当前对谈请选择支持上下文的知乎直答模型。', 400)
    result = request('/v1/chat/completions', payload={'model': model, 'messages': messages, 'stream': False})
    try:
        choice = result['choices'][0]
        text = choice['message']['content']
        if choice.get('finish_reason') == 'error' or not isinstance(text, str) or not text.strip():
            raise ValueError()
    except (KeyError, IndexError, TypeError, ValueError):
        raise APIError('知乎直答未返回有效发言，请稍后手动重试。') from None
    return {'text': text[:24000], 'provider': 'zhihu', 'model': model,
            'requestId': str(result.get('id', ''))[:200], 'generatedAt': time.time(), 'fromCache': False}

def turn(messages):
    return completion(messages)['text']
