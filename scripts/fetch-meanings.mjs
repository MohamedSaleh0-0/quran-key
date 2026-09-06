import fs from "node:fs";
import path from "node:path";

const OUTPUT_FILE = path.resolve("src/data/word-meanings.json");

// عدد آيات كل سورة من الفاتحة (1) إلى الناس (114)
const SURAH_AYA_COUNTS = [
	7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
	123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
	112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
	34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
	54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
	60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
	14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
	28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
	29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
	15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
	11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
	5, 4, 5, 6
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAyahWords(surah, aya) {
	// طلب الآية بنطاق من 1 إلى 150 كلمة ليغطي أطول آيات القرآن (مثل آية الدَّين)
	const url = `https://panel.surahpedia.com/api/v1/projects/meaning-word/content?sura_number=${surah}&aya_number=${aya}&from_word_number=1&to_word_number=150&tajweed=1`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const json = await res.json();
	return json.data || [];
}

async function main() {
	const dir = path.dirname(OUTPUT_FILE);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	let dictionary = {};
	if (fs.existsSync(OUTPUT_FILE)) {
		try {
			dictionary = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
			console.log(`[Resume] تم تحميل ${Object.keys(dictionary).length} كلمة مسجلة مسبقاً.`);
		} catch (e) {}
	}

	console.log("=== بدء استخراج معاني كلمات القرآن الكريم ===");

	for (let s = 1; s <= 114; s++) {
		const totalAyahs = SURAH_AYA_COUNTS[s - 1];
		console.log(`\nجارٍ معالجة السورة ${s}/114 (${totalAyahs} آية)...`);

		for (let a = 1; a <= totalAyahs; a++) {
			const checkKey = `${s}:${a}:1`;
			if (dictionary[checkKey]) {
				continue; // تخطي الآية إن كانت مسحوبة مسبقاً
			}

			let retries = 3;
			while (retries > 0) {
				try {
					const words = await fetchAyahWords(s, a);
					for (const item of words) {
						if (item.word_number && item.content) {
							const key = `${s}:${a}:${item.word_number}`;
							// تطبيع المحارف وتجريد المسافات الزائدة
							const cleanContent = item.content.normalize("NFKC").trim();
							dictionary[key] = cleanContent;
						}
					}
					process.stdout.write(`\r- سورة ${s} -> آية ${a}/${totalAyahs} مكتملة.`);
					// مهلة 40ms لتفادي إرهاق السيرفر
					await sleep(40);
					break;
				} catch (err) {
					retries--;
					if (retries === 0) {
						console.error(`\nفشل نهائي عند السورة ${s} الآية ${a}: ${err.message}`);
					} else {
						await sleep(1500);
					}
				}
			}
		}

		// حفظ دوري بعد كل سورة لحماية البيانات المجمعة
		fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dictionary), "utf-8");
	}

	console.log("\n\nاكتمل السحب بنجاح تام!");
	const finalSizeMb = (fs.statSync(OUTPUT_FILE).size / (1024 * 1024)).toFixed(2);
	console.log(`تم حفظ ${Object.keys(dictionary).length} كلمة في: ${OUTPUT_FILE} (الحجم: ${finalSizeMb} ميجابايت)`);
}

main().catch(console.error);