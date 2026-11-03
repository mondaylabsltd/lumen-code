// Privacy and terms for the website and distributed apps. Keep the data disclosures aligned
// with app.html, browser storage, permissions and store reports; never promise absolute immunity.
import type { Lang } from './i18n';

export const UPDATED = '2026-11-03';
export const COMPANY = 'MONDAY LABS LTD';
export const CONTACT = 'hello@mondaylabs.ltd';
const LICENSE = 'https://github.com/mondaylabsltd/lumen-code/blob/main/LICENSE';
const CLOUDFLARE = 'https://www.cloudflare.com/privacypolicy/';
const ICO = 'https://ico.org.uk/make-a-complaint/';

export interface LegalDoc {
	title: string;
	description: string;
	summary?: string[];
	sections: { h: string; p?: string[]; list?: string[] }[];
}
export interface Legal {
	updated: string;
	summaryTitle: string;
	home: string;
	privacy: LegalDoc;
	terms: LegalDoc;
}

const en: Legal = {
	updated: 'Last updated: ',
	summaryTitle: 'Key points',
	home: 'Home',
	privacy: {
		title: 'Privacy Policy',
		description:
			'Files and camera images are processed locally. What the website, app stores and support email handle.',
		sections: [
			{
				h: 'Files stay under your control',
				p: [
					`${COMPANY} provides Lumen Code at lumencode.link and its mobile and desktop apps. Files, text and camera images are processed on your devices and are never uploaded to our servers. We do not record the camera or provide cloud storage or file recovery.`,
					'The apps contain no analytics or advertising and do not send your content over the internet. Camera access is used for receiving; saving a photo on iPhone requires permission to add it to Photos. Files are saved where you choose.'
				]
			},
			{
				h: 'Website records',
				p: [
					`Cloudflare processes IP addresses and request details to deliver and protect the website. See [Cloudflare’s privacy policy](${CLOUDFLARE}). Rybbit, served from tj.appsdata.org, records page addresses including query parameters, referrers, device and browser information, approximate location and outbound-link clicks to help us understand website use.`,
					'The website stores your settings and a random analytics identifier in browser local storage. It does not use analytics cookies or record your screen, typed text or transferred files. Blocking the analytics script does not prevent transfers.'
				]
			},
			{
				h: 'Stores and email',
				p: [
					'Apple and Google process purchases under their own policies. We may receive sales and technical crash reports, but not payment-card details or transferred files. If you email us, we use your address and message to handle the conversation.'
				]
			},
			{
				h: 'Purpose and retention',
				p: [
					'We use these records for operating, securing and improving the tool and responding to enquiries, based on our legitimate interests. We do not sell personal data or use it for advertising. We keep records only as needed for those purposes, legal obligations or an unresolved dispute, then delete or anonymise them.',
					'Hosting, analytics, store and email providers process relevant records for these purposes. Processing may occur outside your country; applicable transfer safeguards are required where the law requires them.'
				]
			},
			{
				h: 'Contact and choices',
				p: [
					`You can clear local website data and revoke camera access in your browser or device settings. For applicable data-access, correction, deletion, restriction, objection or portability requests, email [${CONTACT}](mailto:${CONTACT}). You may also contact your local data-protection authority, including the [UK ICO](${ICO}). Policy changes are dated on this page.`
				]
			}
		]
	},
	terms: {
		title: 'Terms of Service',
		description:
			'A local file-transfer tool: your responsibilities, purchase rules, usage risks and limits on warranties and liability.',
		sections: [
			{
				h: 'About the tool',
				p: [
					`${COMPANY} provides the Lumen Code website and apps. They transfer files between a screen and a camera. By using them you accept these terms; if you do not agree, stop using them. The source code remains available under the [MIT License](${LICENSE}); these terms do not change that licence.`
				]
			},
			{
				h: 'Your responsibilities',
				p: [
					'Only send content you are authorised to share. You are responsible for its legality, the devices and recipients you choose, keeping backups and checking received files before opening or deleting originals. Do not distribute malware, infringe others’ rights or attack the website. We do not receive or supervise transfers and cannot restore lost files.',
					'Do not rely on this tool as the only backup, or for a safety-critical operation where a failed or delayed transfer could cause injury or serious loss.'
				]
			},
			{
				h: 'Transfer and flashing-light risks',
				p: [
					'Transfers are not encrypted or authenticated. Anyone who can see or record the code may read its content. Encrypt sensitive files first, and verify the sender independently.',
					'The sending display changes colour up to 60 times per second. Do not look at it if you are sensitive to flashing light; stop using it if you feel unwell.'
				]
			},
			{
				h: 'Purchases and maintenance',
				p: [
					'Mobile store apps are a one-time purchase, without a subscription. Android and iPhone are purchased separately; the price shown by the store at purchase applies. Stores process payments, and refunds follow their procedures and applicable law. Apple’s standard app licence applies to App Store purchases.',
					'Buying an app does not include custom development, a support response deadline, future features or perpetual updates. We may change or stop the website or future maintenance. Installed apps perform transfers locally without our servers.'
				]
			},
			{
				h: 'Warranties and liability',
				p: [
					'Except for guarantees required by applicable law, the tool is provided “as is” and “as available”. We do not promise uninterrupted or error-free operation, a particular speed, compatibility with every device or fitness for a particular purpose.',
					'To the extent permitted by law, we are not responsible for losses caused by device faults, third-party services or misuse that we did not cause. We exclude liability for loss of business profits, business interruption and goodwill from commercial use. Developers and contributors do not assume additional obligations merely by making the source available.',
					'These limits do not exclude fraud, death or personal injury caused by our negligence, or any responsibility or protection that applicable law does not allow us to exclude.'
				]
			},
			{
				h: 'Updates and contact',
				p: [
					`Updates to these terms are dated here and apply to subsequent use; they do not retroactively change completed purchase agreements. Contact [${CONTACT}](mailto:${CONTACT}) with questions.`
				]
			}
		]
	}
};

const zh: Legal = {
	updated: '最后更新：',
	summaryTitle: '要点',
	home: '首页',
	privacy: {
		title: '隐私政策',
		description: '文件和相机画面在本地处理；简要说明网站、应用商店及联系邮件会处理哪些信息。',
		sections: [
			{
				h: '文件由你掌握',
				p: [
					`${COMPANY} 提供 lumencode.link 网站及 Lumen Code 手机、桌面应用。文件、文字和相机画面在设备本地处理，不会上传到我们的服务器。我们不录制相机画面，也不提供云存储或文件恢复。`,
					'应用不含统计或广告，也不通过互联网发送你的内容。相机用于接收；iPhone 保存图片时会申请添加到照片的权限。文件保存在你选择的位置。'
				]
			},
			{
				h: '网站会记录什么',
				p: [
					`Cloudflare 处理 IP 地址和请求信息，用于提供页面和防范滥用，详见其[隐私政策](${CLOUDFLARE})。来自 tj.appsdata.org 的 Rybbit 统计页面地址（含查询参数）、来源、设备及浏览器信息、大致地区和外链点击，帮助我们了解网站使用情况。`,
					'网站在浏览器本地保存设置和随机统计标识；统计不使用 Cookie，不录屏，不记录你输入或传输的内容。屏蔽统计脚本不影响传输。'
				]
			},
			{
				h: '商店与邮件',
				p: [
					'Apple、Google 按各自政策处理购买。我们可能收到销售及技术崩溃报告，但不会收到银行卡信息或传输文件。你发来邮件时，我们使用邮件地址和内容处理沟通。'
				]
			},
			{
				h: '用途与保存',
				p: [
					'上述记录基于运营、安全、改进工具和回复咨询的合法利益处理，不出售个人数据，也不用于广告。仅在这些用途、法律义务或未结争议所需期间保留，之后删除或匿名化。',
					'托管、统计、商店和邮件服务商会为上述用途处理相关记录；处理地点可能在你所在国家以外，涉及跨境时采用法律要求的保障措施。'
				]
			},
			{
				h: '联系与选择',
				p: [
					`你可在浏览器或系统设置中清除本地网站数据、撤销相机权限。如需依法访问、更正、删除、限制处理、反对处理或迁移个人数据，请联系 [${CONTACT}](mailto:${CONTACT})；也可向所在地数据保护机构（包括[英国 ICO](${ICO})）反映问题。政策更新以本页日期为准。`
				]
			}
		]
	},
	terms: {
		title: '服务条款',
		description: '一个本地传文件工具：简要说明使用责任、购买规则、风险及免责边界。',
		sections: [
			{
				h: '工具与适用范围',
				p: [
					`${COMPANY} 提供 Lumen Code 网站和应用，用屏幕与相机传文件。继续使用表示接受本条款；如不同意，请停止使用。源代码仍按 [MIT 许可证](${LICENSE}) 开放，本条款不改变该许可证。`
				]
			},
			{
				h: '你需要负责什么',
				p: [
					'只传输你有权分享的内容。内容是否合法、设备和接收对象的选择、保留备份，以及打开文件或删除原件前的核对，由你负责。不得传播恶意软件、侵权或攻击网站。我们不接收、不监督传输，也无法恢复丢失的文件。',
					'请勿把本工具作为唯一备份，或用于传输失败、延误就可能造成人身伤害或重大损失的关键操作。'
				]
			},
			{
				h: '传输与闪光风险',
				p: [
					'传输不加密，也不验证发送者身份。能看到或录下码的人可能读出内容；敏感文件请先加密，并另外确认来源。',
					'发送画面每秒最多变色 60 次。对闪光敏感的人请勿注视；出现不适应立即停止使用。'
				]
			},
			{
				h: '购买与维护',
				p: [
					'手机商店版采用一次购买，无需订阅。Android 与 iPhone 分别购买，价格以购买时的商店页面为准。商店负责付款处理，退款按商店流程和适用法律办理；App Store 购买适用 Apple 标准应用许可。',
					'购买不包含定制开发、承诺时限的支持、新功能或永久更新。我们可能调整或停止网站及后续维护；已安装应用在本地传输，不依赖我们的服务器。'
				]
			},
			{
				h: '担保与责任边界',
				p: [
					'除法律强制要求的担保外，本工具按“现状”和“可用状态”提供；不承诺始终可用、无错误、固定速度、兼容所有设备或适合特定用途。',
					'在法律允许的范围内，因设备故障、第三方服务或不当使用造成且非由我们引起的损失，我们不承担责任；商业使用中的利润、营业中断及商誉损失也不在赔偿范围。开发者和贡献者不会仅因提供源代码而承担额外义务。',
					'上述限制不排除欺诈、因我们的疏忽导致的人身伤亡，以及法律不允许排除的责任或保障。'
				]
			},
			{
				h: '更新与联系',
				p: [
					`条款更新以本页日期为准，适用于后续使用，不追溯改变已完成购买的约定。如有问题，请联系 [${CONTACT}](mailto:${CONTACT})。`
				]
			}
		]
	}
};

export const LEGAL: Record<Lang, Legal> = { en, zh };

/** Text with **bold** and [links](url), cut into parts for rendering. */
export function inline(text: string): { text: string; href?: string; bold?: boolean }[] {
	const out: { text: string; href?: string; bold?: boolean }[] = [];
	const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
	let last = 0;
	for (const m of text.matchAll(re)) {
		if (m.index! > last) out.push({ text: text.slice(last, m.index) });
		out.push(m[1] ? { text: m[1], bold: true } : { text: m[2], href: m[3] });
		last = m.index! + m[0].length;
	}
	if (last < text.length) out.push({ text: text.slice(last) });
	return out;
}
