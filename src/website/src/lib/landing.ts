// Everything the home page says, in English and Chinese:
// every number states its conditions and comes from the protocol (docs/PROTOCOL.md, incl.
// Appendix C), the measurements (docs/guide/04-performance.md) or the code.
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
	nav: { apps: string; how: string; speed: string; pricing: string };
	hero: {
		title: [string, string];
		send: string;
		recv: string;
	};
	how: { title: string; flow: string[]; note: string };
	speed: {
		title: string;
		head: [string, string, string, string];
		rows: [string, string, string, string][];
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
		how: 'How it works',
		speed: 'Performance',
		pricing: 'Pricing'
	},
	hero: {
		title: ['Send files from', 'a screen to a camera'],
		send: 'Send a file',
		recv: 'Receive'
	},
	how: {
		title: 'How it works',
		flow: ['File to pictures', 'Camera reads', 'File restored'],
		note: 'Missed a picture? Keep scanning.'
	},
	speed: {
		title: 'Performance',
		head: ['', 'Animated QR v25-L', 'Phone screen (example)', '13″ laptop (example)'],
		rows: [
			['Grid (cells)', '117 × 117', '83 × 147', '143 × 254'],
			['Bits per cell', '1', '2', '2 / 3'],
			['Payload per frame', '1.24 KB', '2.2 KB', '6.9 / 10.3 KB'],
			['Raw rate at 12 fps', '15 KB/s', '27 KB/s', '82 / 124 KB/s']
		],
		note: 'The sender plays 4–60 fps (12 by default). Measured end to end on real phones, Android app sending to iPhone app: 96 KB/s. What a receiver achieves depends on its camera; the receive screen shows the live rate and what limits it.',
		more: 'Methodology and measurements'
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
	nav: { apps: '应用', how: '原理', speed: '性能', pricing: '定价' },
	hero: {
		title: ['用屏幕和相机', '传文件'],
		send: '发送文件',
		recv: '接收'
	},
	how: {
		title: '原理',
		flow: ['文件变画面', '相机读取', '还原文件'],
		note: '漏拍几张，继续扫就好。'
	},
	speed: {
		title: '性能',
		head: ['', '动态二维码 v25-L', '手机屏幕（示例）', '13 英寸笔记本（示例）'],
		rows: [
			['网格（格）', '117 × 117', '83 × 147', '143 × 254'],
			['每格比特', '1', '2', '2 / 3'],
			['每帧有效数据', '1.24 KB', '2.2 KB', '6.9 / 10.3 KB'],
			['12 fps 原始速率', '15 KB/s', '27 KB/s', '82 / 124 KB/s']
		],
		note: '发送端 4–60 fps（默认 12）。真机端到端实测：Android 应用发送、iPhone 应用接收，96 KB/s。接收端实际能到多少取决于相机，接收界面会实时显示速率和限速环节。',
		more: '测量方法与数据'
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
