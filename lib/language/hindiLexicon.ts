/**
 * Common romanized Hindi words. Words that are also common English words (to, me, do, the, is, main, par, use, tab, din...)
 * are deliberately excluded so English sentences are not misclassified.
 */
const WORDS = `
kya kaise kaisa kaisi kaisे kab kahan kahaan kaun kisne kisko kisi kiska kiski kiske kidhar kyun kyon kyu kyunki kitna kitne kitni kitna
hai hain hoon hun hoga hogi honge hota hoti hote hua hui hue hona hone tha thi thhe raha rahi rahe rahega rahegi
ka ki ke ko se mein mujhe mujhko mera meri mere tera teri tere apna apni apne aap aapka aapki aapke hum humara hamara hamari tum tumhara
unka unki unke iska iski iske uska uski uske isme usme isse usse inhe unhe inko unko yeh ye woh wo yahan yaha wahan vahan jahan idhar udhar
batao bataiye bataye bata batana samjhao samjhaiye samjha dikhao dikha dikhaiye bolo boliye likho likhna dekho dekhna dekhe
karna karni karne kare karein karen kiya kiye kiyi karo karta karti karte karun karu karke karwana karwa kar
lena lene leni lo lijiye liya lekar dena dene deni do_ diya dijiye dekar jana jane jaana jao jaye jayega jayegi gaya gayi gaye
aana aane aaya aayi aao aaye milna milta milti milega milegi mile chalega chalta chalti chalo chahiye chahta chahti chahte
sakta sakte sakti sakun sakta_ padta padti padega padegi lagta lagti lagega lagegi lagenge rakhna rakhe rakho rakhein
bhejna bheje bhejo bhejein bharna bharni bharo bhare kholna kholo khole badalna badle badlo puchna poochna pucho
wala wali wale vala vali vale liye ke_liye tak bahut bohot bahot thoda thodi zyada jyada kam kaafi kaafi
pehle pahle baad andar bahar upar niche neeche saath sath bina sirf abhi kabhi hamesha hameshaa
aur lekin magar agar toh phir fir ya ji haan han nahi nahin nhi mat
theek thik accha achha acha sahi galat jaruri zaroori zaruri jaroori
sab sabhi bhi koi kuch kuchh kuchh_ sabko
kaam chhutti chutti tankhwah vetan naukri karmchari prakriya niyam dastavez jaankari jankari sawal jawab uttar
kripya dhanyavad shukriya namaste pura puri poora
tarah tarike tarika tareeka bataiyega samay waqt roz hafte mahine saal
ab jab tab_ jo jis jisne jise jinhe jaise waise aise vaise isliye isiliye tabhi jabki
hamein humein tumhein unhein unhone inhone usne isne maine humne tumne aapne
ghar office_ karyalay vibhag adhikari prabandhak
hoon ho_ hu hai_ hain_ thhi
kyaa batayein samjhein samjhaye
bolna bolta bolti kehna kehte kahte kehta kahna
sakte_ chahein chahe
mil mila mili milke
pata pta
`;

export const HINDI_WORDS: ReadonlySet<string> = new Set(
  WORDS.split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w && !w.endsWith("_") && /^[a-z]+$/.test(w)),
);

export function isHindiMarker(token: string): boolean {
  return HINDI_WORDS.has(token.toLowerCase());
}
