import Link from 'next/link';
import { Box, Map, Layers, Calculator, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/layout/Footer';

const features = [
  {
    icon: Map,
    title: '유휴지 탐색',
    description: '대한민국 전체 유휴지를 지도에서 탐색하고, 최적의 부지를 선택하세요.',
  },
  {
    icon: Layers,
    title: '법규 자동 확인',
    description: '용도지역에 따른 건폐율, 용적률, 높이제한을 자동으로 계산합니다.',
  },
  {
    icon: Box,
    title: '3D 모듈 조합',
    description: '15가지 이상의 모듈을 레고처럼 조합하여 나만의 건축물을 설계하세요.',
  },
  {
    icon: Calculator,
    title: '실시간 비용 산출',
    description: '모듈 배치와 재료 선택에 따른 총공사비를 실시간으로 확인합니다.',
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white py-24">
          <div className="mx-auto max-w-7xl px-4 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-medium text-blue-700">
              <Box className="h-4 w-4" />
              모듈러 건축의 새로운 시작
            </div>
            <h1 className="mb-6 text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl">
              모두의 모듈
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-slate-600">
              유휴지를 탐색하고, 건축 법규에 맞는 모듈러 건축물을 게임처럼 조합하세요.
              <br />
              부지 선택부터 비용 산출, 도면화까지 웹에서 한번에.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button asChild size="lg" className="gap-2">
                <Link href="/map">
                  시작하기
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/projects">내 프로젝트</Link>
              </Button>
            </div>
          </div>

          {/* Background decoration */}
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-100/50 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-100/50 blur-3xl" />
        </section>

        {/* Features */}
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="mb-12 text-center text-3xl font-bold text-slate-900">
              하나의 플랫폼에서 모든 것을
            </h2>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 inline-flex rounded-lg bg-blue-50 p-3">
                    <Icon className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">{title}</h3>
                  <p className="text-sm text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="bg-slate-50 py-20">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="mb-12 text-center text-3xl font-bold text-slate-900">이용 방법</h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {[
                {
                  step: '01',
                  title: '부지 선택',
                  desc: '지도에서 원하는 유휴지를 찾아 선택합니다. 면적, 가격, 법규 정보를 확인하세요.',
                },
                {
                  step: '02',
                  title: '모듈 조합',
                  desc: '3D 빌더에서 구조, 기능, 디자인 모듈을 자유롭게 배치합니다. 법규를 실시간 확인합니다.',
                },
                {
                  step: '03',
                  title: '결과 확인',
                  desc: '총공사비를 확인하고, 평면도를 내보내세요. 프로젝트를 저장하고 공유할 수 있습니다.',
                },
              ].map(({ step, title, desc }) => (
                <div key={step} className="text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                    {step}
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-slate-900">{title}</h3>
                  <p className="text-sm text-slate-600">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="mb-4 text-3xl font-bold text-slate-900">
              지금 바로 시작하세요
            </h2>
            <p className="mb-8 text-slate-600">
              복잡한 건축 설계를 누구나 쉽게. 모듈러 건축의 미래를 경험하세요.
            </p>
            <Button asChild size="lg" className="gap-2">
              <Link href="/map">
                유휴지 탐색하기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
