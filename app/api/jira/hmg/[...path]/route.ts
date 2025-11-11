import { NextRequest, NextResponse } from 'next/server';
import { JIRA_ENDPOINTS, JIRA_API_VERSION } from '@/lib/constants/jira';
import axios, { AxiosError } from 'axios';
import https from 'https';

// SSL 인증서 검증 비활성화 (내부 네트워크용)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  return handleJiraRequest(request, params, 'GET');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  return handleJiraRequest(request, params, 'POST');
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  return handleJiraRequest(request, params, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  return handleJiraRequest(request, params, 'DELETE');
}

async function handleJiraRequest(
  request: NextRequest,
  params: { path: string[] },
  method: string
) {
  try {
    const email = process.env.HMG_JIRA_EMAIL;
    const apiToken = process.env.HMG_JIRA_API_TOKEN;

    if (!email || !apiToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'HMG Jira 인증 정보가 설정되지 않았습니다.',
        },
        { status: 500 }
      );
    }

    // URL 경로 구성
    const path = params.path.join('/');
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${JIRA_ENDPOINTS.HMG}${JIRA_API_VERSION}/${path}${
      searchParams ? `?${searchParams}` : ''
    }`;

    // 요청 바디 읽기 (POST, PUT의 경우)
    let body;
    if (method === 'POST' || method === 'PUT') {
      try {
        body = await request.json();
      } catch {
        body = null;
      }
    }

    // Jira API 호출 (axios 사용)
    const response = await axios({
      method: method.toLowerCase() as 'get' | 'post' | 'put' | 'delete',
      url,
      auth: {
        username: email,
        password: apiToken,
      },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      data: body,
      httpsAgent, // SSL 인증서 검증 비활성화
    });

    return NextResponse.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error('HMG Jira API Error:', error);

    // axios 에러 처리
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{
        errorMessages?: string[];
        message?: string;
      }>;

      if (axiosError.response) {
        return NextResponse.json(
          {
            success: false,
            error:
              axiosError.response.data?.errorMessages?.[0] ||
              axiosError.response.data?.message ||
              '요청 처리 중 오류가 발생했습니다.',
            details: axiosError.response.data,
          },
          { status: axiosError.response.status }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : '알 수 없는 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
