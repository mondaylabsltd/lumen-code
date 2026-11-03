// Everything the home page says, in English and Chinese:
// Device transfer rates are field results reported by the maintainer, not protocol-capacity
// estimates or competitor benchmarks. Their scope is recorded in docs/guide/04-performance.md.
import type { Lang } from './i18n';

/** One price worldwide for the iPhone and Android apps, paid once; each store converts it. */
export const PRICE = 'US$2.99';
/** Store pages, once the apps are published; until then the page says "coming soon". */
export const STORES: { appStore: string | null; googlePlay: string | null } = {
	appStore: null,
	googlePlay: null
};

interface Plan {
	name: string;
	price: string;
	per: string;
	points: string[];
	action?: string;
}

export interface Landing {
	nav: { apps: string; speed: string; pricing: string };
	hero: {
		title: [string, string];
		send: string;
		recv: string;
	};
	speed: {
		title: string;
		head: [string, string, string];
		rows: [string, string, string][];
		note: string;
		more: string;
	};
	apps: { title: string; items: { name: string; req: string }[] };
	pricing: { title: string; lead: string; build: Plan; store: Plan; note: string };
	faq: { title: string; items: { q: string; a: string }[] };
	cta: { title: string };
	soon: string;
	license: string;
}

const en: Landing = {
	nav: {
		apps: 'Apps',
		speed: 'Performance',
		pricing: 'Pricing'
	},
	hero: {
		title: ['Send files', 'without internet.'],
		send: 'Send a file',
		recv: 'Receive'
	},
	speed: {
		title: 'Real-device speeds',
		head: ['Sending device', 'Receiving device', 'Measured speed'],
		rows: [
			['Computer', 'iPhone app', '≈ 0.5 MB/s'],
			['Android app', 'iPhone app', '≈ 100 KB/s']
		],
		note: 'Higher playback frame rates can increase speed on capable devices. Results vary with the devices and capture conditions.',
		more: 'About these results'
	},
	apps: {
		title: 'Apps',
		items: [
			{
				name: 'Web',
				req: 'Any browser with a camera'
			},
			{
				name: 'iPhone',
				req: 'iOS 17 or later'
			},
			{
				name: 'Android',
				req: 'Android 10 or later'
			},
			{
				name: 'Desktop',
				req: 'macOS 12+, Windows 10/11, Linux'
			}
		]
	},
	pricing: {
		title: 'Pricing',
		lead: 'The web version is free. The store app and the one you build yourself are the same app; buying it saves the build and supports Lumen Code’s maintenance.',
		build: {
			name: 'Build it yourself',
			price: 'Free',
			per: 'forever',
			points: ['Needs Android Studio, or Xcode on a Mac'],
			action: 'How to build'
		},
		store: { name: 'Google Play and App Store', price: PRICE, per: 'once', points: [] },
		note: 'No subscription. Android and iPhone are purchased separately. Final pricing will be shown on each store page once the apps are available.'
	},
	faq: {
		title: 'Questions',
		items: [
			{
				q: 'When would I use Lumen Code?',
				a: 'When your devices have no shared network or USB is unavailable, transfer files through a screen and a camera.'
			},
			{
				q: 'What does the phone app offer over the web version?',
				a: 'The phone app receives files faster than the web version and works fully offline once installed.'
			},
			{
				q: 'Can iPhone, Android and computers transfer files to each other?',
				a: 'Yes. iPhone, Android and computers can all transfer files to each other. The desktop app is free.'
			},
			{
				q: 'What can I send?',
				a: 'Documents, photos, configuration files and more. You can also send text directly.'
			}
		]
	},
	cta: {
		title: 'Try it with two devices you already have.'
	},
	soon: 'Coming soon',
	license: 'Open source under the MIT License.'
};

const zh: Landing = {
	nav: { apps: '应用', speed: '性能', pricing: '定价' },
	hero: {
		title: ['不联网，', '也能传文件。'],
		send: '发送文件',
		recv: '接收'
	},
	speed: {
		title: '实测速度',
		head: ['发送设备', '接收设备', '实测速度'],
		rows: [
			['电脑', 'iPhone 应用', '≈ 0.5 MB/s'],
			['Android 应用', 'iPhone 应用', '≈ 100 KB/s']
		],
		note: '合适的设备可调高播放帧率提速，实际速度随设备与拍摄条件变化。',
		more: '测试说明'
	},
	apps: {
		title: '应用',
		items: [
			{
				name: '网页',
				req: '任何带相机的浏览器'
			},
			{
				name: 'iPhone',
				req: 'iOS 17 及以上'
			},
			{
				name: 'Android',
				req: 'Android 10 及以上'
			},
			{
				name: '桌面',
				req: 'macOS 12+、Windows 10/11、Linux'
			}
		]
	},
	pricing: {
		title: '定价',
		lead: '网页版免费。商店版和自己编译的是同一个应用；买商店版省去编译，也支持 Lumen Code 的持续维护。',
		build: {
			name: '自己编译',
			price: '免费',
			per: '永久',
			points: ['需要 Android Studio，或 Mac 上的 Xcode'],
			action: '怎样编译'
		},
		store: { name: 'Google Play 与 App Store', price: PRICE, per: '一次性', points: [] },
		note: '无需订阅。Android 与 iPhone 分别购买，实际价格以上架后的商店页面为准。'
	},
	faq: {
		title: '常见问题',
		items: [
			{
				q: '什么时候会用到 Lumen Code？',
				a: '设备没有共同网络，或 USB 用不了时，用屏幕和相机就能传文件。'
			},
			{
				q: '手机应用比网页版好在哪里？',
				a: '手机应用接收文件比网页版更快，安装后还能完全离线使用。'
			},
			{
				q: 'iPhone、Android 和电脑能互传吗？',
				a: '能，iPhone、Android 和电脑之间都能互传，电脑端可用免费桌面版。'
			},
			{
				q: '可以传哪些内容？',
				a: '文档、照片、配置文件都能传，也可以直接发送文字。'
			}
		]
	},
	cta: { title: '用手边的两台设备试试。' },
	soon: '即将上架',
	license: '以 MIT 许可证开源。'
};

export const LANDING: Record<Lang, Landing> = { en, zh };
