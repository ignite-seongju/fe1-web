'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Plus, ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { JIRA_USER_LIST, JIRA_ENDPOINTS } from '@/lib/constants/jira';
import { jira } from '@/lib/services/jira';
import { JiraIssue } from '@/lib/types/jira';

export default function CreateTicketPage() {
  // 에픽 목록
  const [fehgEpics, setFehgEpics] = useState<JiraIssue[]>([]);
  const [isLoadingEpics, setIsLoadingEpics] = useState(false);

  // 입력 필드
  const [selectedEpic, setSelectedEpic] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [assignee, setAssignee] = useState<string>('');
  const [estimatedTime, setEstimatedTime] = useState<string>('');
  const [estimatedTimeError, setEstimatedTimeError] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // 생성 상태
  const [isCreating, setIsCreating] = useState(false);
  const [createdTicketKey, setCreatedTicketKey] = useState<string>('');

  // FEHG 완료되지 않은 에픽 조회 (페이지 로드 시)
  useEffect(() => {
    const loadEpics = async () => {
      setIsLoadingEpics(true);
      try {
        const result = await jira.ignite.getFEHGIncompleteEpics();
        if (result.success && result.data) {
          setFehgEpics(result.data.issues);
        } else {
          toast.error('에픽 목록을 불러올 수 없습니다.');
        }
      } catch {
        toast.error('에픽 조회 중 오류가 발생했습니다.');
      } finally {
        setIsLoadingEpics(false);
      }
    };

    loadEpics();
  }, []);

  // 최초추정치 유효성 검증 (예: 3d, 1m, 2w, 1.5h)
  const validateEstimatedTime = (value: string): boolean => {
    if (!value.trim()) return false;
    const pattern = /^(\d+\.?\d*)(d|m|w|h)$/i;
    return pattern.test(value.trim());
  };

  // 최초추정치 입력 핸들러
  const handleEstimatedTimeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEstimatedTime(value);

    // 실시간 유효성 검증
    if (value.trim() && !validateEstimatedTime(value)) {
      setEstimatedTimeError('형식이 올바르지 않습니다 (예: 3d, 1m, 2w, 1.5h)');
    } else {
      setEstimatedTimeError('');
    }
  };

  const handleCreateTicket = async () => {
    // 필수값 검증
    if (!selectedEpic) {
      toast.error('상위 에픽을 선택해주세요.');
      return;
    }
    if (!summary.trim()) {
      toast.error('티켓 제목을 입력해주세요.');
      return;
    }
    if (!assignee) {
      toast.error('담당자를 선택해주세요.');
      return;
    }
    // 최초추정치 입력했으면 형식 검증
    if (estimatedTime.trim() && !validateEstimatedTime(estimatedTime)) {
      toast.error('최초추정치 형식이 올바르지 않습니다. (예: 3d, 1m, 2w)');
      return;
    }

    setIsCreating(true);
    setCreatedTicketKey('');

    try {
      // 사용자 정보 가져오기
      const userInfo = JIRA_USER_LIST.find((user) => user.name === assignee);
      if (!userInfo) {
        toast.error('담당자 정보를 찾을 수 없습니다.');
        return;
      }

      toast.info(`"${summary}" 티켓 생성을 시작합니다...`);

      // 티켓 생성 payload (필수 필드)
      const fields: Record<string, unknown> = {
        project: { key: 'FEHG' },
        summary,
        issuetype: { name: '작업' },
        parent: { key: selectedEpic }, // Epic Link
        assignee: { accountId: userInfo.igniteAccountId },
      };

      // 선택 필드 추가
      if (startDate) {
        fields.customfield_10015 = startDate; // 시작일
      }
      if (endDate) {
        fields.duedate = endDate; // 종료일
      }
      if (estimatedTime.trim()) {
        fields.timetracking = {
          originalEstimate: estimatedTime.trim(),
        };
      }

      const payload = { fields };

      // API 호출
      const response = await fetch('/api/jira/ignite/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success && result.data) {
        const ticketKey = result.data.key;
        setCreatedTicketKey(ticketKey);
        toast.success(`티켓이 생성되었습니다! (${ticketKey})`, {
          duration: 5000,
        });

        // 입력 필드 초기화
        setSummary('');
        setAssignee('');
        setEstimatedTime('');
        setStartDate('');
        setEndDate('');
      } else {
        toast.error(result.error || '티켓 생성에 실패했습니다.');
      }
    } catch (error) {
      toast.error(
        `티켓 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsCreating(false);
    }
  };

  // 에픽이 선택되었는지 확인
  const isEpicSelected = !!selectedEpic;

  // 티켓 링크 복사
  const handleCopyTicketLink = async () => {
    if (!createdTicketKey) return;

    const ticketUrl = `${JIRA_ENDPOINTS.IGNITE}/browse/${createdTicketKey}`;

    try {
      await navigator.clipboard.writeText(ticketUrl);
      toast.success('티켓 링크가 클립보드에 복사되었습니다!');
    } catch {
      toast.error('복사에 실패했습니다.');
    }
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                돌아가기
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">FEHG 티켓 생성</h1>
              <p className="text-sm text-muted-foreground">
                새로운 FEHG 티켓을 생성합니다
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>티켓 정보</CardTitle>
            <CardDescription>
              상위 에픽을 선택하고 티켓 정보를 입력하세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 에픽 선택 */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                상위 에픽
                <span className="text-red-500">*</span>
              </label>
              <Select
                value={selectedEpic}
                onValueChange={setSelectedEpic}
                disabled={isLoadingEpics}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingEpics
                        ? '에픽 목록 로딩 중...'
                        : '상위 에픽을 선택하세요'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {fehgEpics
                    .slice()
                    .sort((a, b) => {
                      // 1. 제목 기준 오름차순
                      const summaryCompare = a.fields.summary.localeCompare(
                        b.fields.summary
                      );
                      if (summaryCompare !== 0) return summaryCompare;
                      // 2. 티켓 번호 기준 오름차순
                      return a.key.localeCompare(b.key);
                    })
                    .map((epic) => (
                      <SelectItem key={epic.id} value={epic.key}>
                        {epic.key} - {epic.fields.summary}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {fehgEpics.length === 0 && !isLoadingEpics && (
                <p className="text-xs text-muted-foreground">
                  진행 중인 에픽이 없습니다.
                </p>
              )}
            </div>

            {/* 에픽 선택 후 나타나는 입력 필드들 */}
            {isEpicSelected && (
              <div className="space-y-6 pt-6 mt-4 border-t">
                {/* Summary */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    티켓 제목 (Summary)
                    <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="티켓 제목을 입력하세요"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground">
                    {summary.length}/100자
                  </p>
                </div>

                {/* 담당자 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    담당자
                    <span className="text-red-500">*</span>
                  </label>
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger>
                      <SelectValue placeholder="담당자를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {JIRA_USER_LIST.map((user) => (
                        <SelectItem
                          key={user.igniteAccountId}
                          value={user.name}
                        >
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 최초추정치 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">최초추정치</label>
                  <Input
                    placeholder="예: 3d, 1m, 2w, 1.5h (선택사항)"
                    value={estimatedTime}
                    onChange={handleEstimatedTimeInput}
                    className={
                      estimatedTimeError
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : ''
                    }
                  />
                  {estimatedTimeError ? (
                    <p className="text-xs text-red-500">{estimatedTimeError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      형식: 숫자 + 단위 (d=일, m=분, w=주, h=시간)
                    </p>
                  )}
                </div>

                {/* 날짜 선택 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">시작일</label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">종료일</label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* 생성 버튼 */}
                <div className="pt-4 border-t">
                  <Button
                    onClick={handleCreateTicket}
                    disabled={isCreating}
                    className="w-full"
                    size="lg"
                  >
                    <Plus
                      className={`mr-2 h-4 w-4 ${isCreating ? 'animate-spin' : ''}`}
                    />
                    {isCreating ? '티켓 생성 중...' : '티켓 생성'}
                  </Button>
                </div>

                {/* 생성 결과 */}
                {createdTicketKey && (
                  <div className="pt-4 border-t">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
                      <p className="text-sm font-semibold text-green-900">
                        ✓ 티켓 생성 완료!
                      </p>
                      <div className="flex flex-col gap-2">
                        <a
                          href={`${JIRA_ENDPOINTS.IGNITE}/browse/${createdTicketKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          {createdTicketKey} 티켓으로 이동
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <Button
                          onClick={handleCopyTicketLink}
                          variant="outline"
                          size="sm"
                          className="w-fit"
                        >
                          <Copy className="mr-2 h-3 w-3" />
                          티켓 링크 복사하기
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
