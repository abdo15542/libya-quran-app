package com.wird.quran

import android.os.Bundle
import android.media.MediaPlayer
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.viewinterop.AndroidView
import java.text.Normalizer
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

private val Emerald = Color(0xFF174B38)
private val EmeraldLight = Color(0xFF2D7955)
private val Gold = Color(0xFFD8BD79)
private val Paper = Color(0xFFF6F0E2)
private val Ink = Color(0xFF173D30)

data class Verse(val number: Int, val text: String)
data class Surah(val number: Int, val name: String, val verses: List<Verse>)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(18, 55, 41)
        window.navigationBarColor = android.graphics.Color.rgb(18, 55, 41)
        setContent { CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) { WirdApp() } }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WirdApp() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("wird_local", 0) }
    val surahs = remember { loadSurahs(context) }
    var tab by remember { mutableStateOf("home") }
    var selectedSurah by remember { mutableIntStateOf(prefs.getInt("last_surah", 1)) }
    var selectedVerse by remember { mutableIntStateOf(1) }
    var mushafPage by remember { mutableIntStateOf(prefs.getInt("last_page", 1).coerceIn(1, 604)) }
    var query by remember { mutableStateOf("") }
    var fontSize by remember { mutableFloatStateOf(prefs.getFloat("font_size", 27f)) }
    var darkMode by remember { mutableStateOf(prefs.getBoolean("dark_mode", false)) }
    val bookmarks = remember { mutableStateListOf<String>().apply { addAll(prefs.getStringSet("bookmarks", emptySet()) ?: emptySet()) } }
    val scheme = if (darkMode) darkColorScheme(primary = Gold, onPrimary = Ink, secondary = EmeraldLight, background = Color(0xFF101C17), surface = Color(0xFF172820), onSurface = Color(0xFFECE6D7), onBackground = Color(0xFFECE6D7))
        else lightColorScheme(primary = Emerald, onPrimary = Color.White, secondary = EmeraldLight, background = Paper, surface = Color.White, onSurface = Ink)
    MaterialTheme(colorScheme = scheme) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            topBar = {
                TopAppBar(
                    title = { Column { Text("وِرد", fontWeight = FontWeight.Bold, color = Gold, fontSize = 23.sp); Text("القرآن الكريم", color = Color.White, fontSize = 11.sp) } },
                    actions = { IconButton(onClick = { tab = "settings" }) { Icon(Icons.Default.Settings, contentDescription = "الإعدادات", tint = Color.White) } },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Emerald)
                )
            },
            bottomBar = {
                NavigationBar(containerColor = Emerald) {
                    listOf(Triple("home", "الرئيسية", Icons.Default.Home), Triple("quran", "المصحف", Icons.Default.MenuBook), Triple("search", "بحث", Icons.Default.Search), Triple("saved", "المحفوظات", Icons.Default.Bookmark), Triple("audio", "التلاوة", Icons.Default.Headphones)).forEach { item ->
                        NavigationBarItem(selected = tab == item.first, onClick = { tab = item.first }, icon = { Icon(item.third, contentDescription = item.second) }, label = { Text(item.second, fontSize = 10.sp) }, colors = NavigationBarItemDefaults.colors(selectedIconColor = Gold, selectedTextColor = Gold, indicatorColor = Color(0xFF2B5A45), unselectedIconColor = Color.White, unselectedTextColor = Color.White))
                    }
                }
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                when (tab) {
                    "home" -> HomeScreen(surahs, selectedSurah, { tab = "reader" }, { selectedSurah = it; prefs.edit().putInt("last_surah", it).apply(); tab = "reader" }, { tab = "quran" }, { tab = "pages" })
                    "quran" -> SurahList(surahs) { selectedSurah = it; prefs.edit().putInt("last_surah", it).apply(); tab = "reader" }
                    "reader" -> ReaderScreen(surahs.getOrNull(selectedSurah - 1), selectedVerse, fontSize, { s, a -> bookmarks.contains(s.toString() + ":" + a) }, { s, a ->
                        val key = s.toString() + ":" + a
                        if (bookmarks.contains(key)) bookmarks.remove(key) else bookmarks.add(key)
                        prefs.edit().putStringSet("bookmarks", bookmarks.toSet()).apply()
                    }, { fontSize = it; prefs.edit().putFloat("font_size", it).apply() }, { tab = "quran" })
                    "search" -> SearchScreen(surahs, query, { query = it }) { s, a -> selectedSurah = s; selectedVerse = a; prefs.edit().putInt("last_surah", s).apply(); tab = "reader" }
                    "saved" -> BookmarksScreen(
                        bookmarks.toList(),
                        surahs,
                        onOpen = { s, a -> selectedSurah = s; selectedVerse = a; prefs.edit().putInt("last_surah", s).apply(); tab = "reader" },
                        onRemove = { key -> bookmarks.remove(key); prefs.edit().putStringSet("bookmarks", bookmarks.toSet()).apply() }
                    )
                    "audio" -> AudioScreen()
                    "pages" -> MushafPagesScreen(mushafPage) { page -> mushafPage = page; prefs.edit().putInt("last_page", page).apply() }
                    "settings" -> SettingsScreen(darkMode) { darkMode = it; prefs.edit().putBoolean("dark_mode", it).apply() }
                }
            }
        }
    }
}

private fun loadSurahs(context: android.content.Context): List<Surah> = try {
    val raw = context.assets.open("quran.json").bufferedReader(Charsets.UTF_8).use { it.readText() }
    val array = JSONObject(raw).getJSONArray("surahs")
    (0 until array.length()).map { i ->
        val s = array.getJSONObject(i)
        val va = s.getJSONArray("verses")
        Surah(s.getInt("number"), s.getString("name"), (0 until va.length()).map { j ->
            val v = va.getJSONObject(j); Verse(v.getInt("number"), v.getString("text"))
        })
    }
} catch (_: Exception) { emptyList() }

@Composable
private fun HomeScreen(surahs: List<Surah>, last: Int, onContinue: () -> Unit, onOpen: (Int) -> Unit, onBrowse: () -> Unit, onPages: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(Modifier.fillMaxWidth().background(Emerald, RoundedCornerShape(26.dp)).padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", color = Gold, fontSize = 18.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            Text("اجعل للقرآن نصيبًا من يومك", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Bold)
            Text("اقرأ بتدبّر، وارجع إلى موضعك متى شئت.", color = Color(0xFFD9E5DC), fontSize = 14.sp)
            HorizontalDivider(color = Color.White.copy(alpha = .22f))
            Text("آخر قراءة", color = Gold, fontSize = 13.sp)
            Text(surahs.getOrNull(last - 1)?.name ?: "الفاتحة", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
            Button(onClick = onContinue, colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = Ink)) { Text("متابعة القراءة") }
        }
        Text("ابدأ رحلتك", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tile("النص القرآني", "114 سورة مع البحث", Modifier.weight(1f), onBrowse)
            Tile("سورة الفاتحة", "ابدأ القراءة", Modifier.weight(1f)) { onOpen(1) }
        }
        Tile("المصحف بالصفحات الأصلية", "604 صفحة • يعمل دون إنترنت", Modifier.fillMaxWidth(), onPages)
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("مصمم ليعمل دون إنترنت", fontWeight = FontWeight.Bold, color = EmeraldLight)
                Text("النص والبحث والمفضلة وصفحات المصحف تعمل محليًا دون إنترنت. يمكنك تنزيل السور الصوتية عند الحاجة.", fontSize = 13.sp, lineHeight = 20.sp)
            }
        }
    }
}

@Composable
private fun Tile(title: String, subtitle: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Card(modifier.clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { Text(title, fontWeight = FontWeight.Bold, fontSize = 18.sp); Text(subtitle, fontSize = 12.sp) }
    }
}

@Composable
private fun SurahList(surahs: List<Surah>, onSelect: (Int) -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("فهرس السور", fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
        if (surahs.isEmpty()) Text("بيانات القرآن غير موجودة. أعد تشغيل سير بناء APK.")
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(surahs) { s ->
                Card(Modifier.fillMaxWidth().clickable { onSelect(s.number) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(42.dp).background(Emerald, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Text(s.number.toString(), color = Gold, fontWeight = FontWeight.Bold) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) { Text(s.name, fontSize = 18.sp, fontWeight = FontWeight.SemiBold); Text(s.verses.size.toString() + " آية", fontSize = 12.sp) }
                        Text("‹", fontSize = 26.sp, color = EmeraldLight)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReaderScreen(surah: Surah?, initialVerse: Int, fontSize: Float, isSaved: (Int, Int) -> Boolean, save: (Int, Int) -> Unit, setFont: (Float) -> Unit, back: () -> Unit) {
    if (surah == null) { Column(Modifier.padding(20.dp)) { Text("تعذّر تحميل النص القرآني."); TextButton(onClick = back) { Text("العودة للفهرس") } }; return }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = back) { Text("الفهرس") }
            Text(surah.name, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Text(surah.number.toString(), color = EmeraldLight)
        }
        Text("حجم الخط", fontSize = 12.sp)
        Slider(value = fontSize, onValueChange = setFont, valueRange = 20f..38f)
        HorizontalDivider(color = Gold.copy(alpha = .6f))
        val listState = androidx.compose.foundation.lazy.rememberLazyListState(initialFirstVisibleItemIndex = initialVerse.coerceIn(1, surah.verses.size))
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Text("سُورَةُ " + surah.name, Modifier.fillMaxWidth().padding(vertical = 12.dp), textAlign = TextAlign.Center, color = Gold, fontSize = 20.sp, fontWeight = FontWeight.Bold) }
            items(surah.verses) { v ->
                Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(14.dp)).padding(14.dp)) {
                    Text(v.text, Modifier.fillMaxWidth(), fontSize = fontSize.sp, lineHeight = (fontSize * 1.8f).sp, textAlign = TextAlign.Justify)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("﴿" + v.number + "﴾", color = EmeraldLight, fontSize = 14.sp)
                        TextButton(onClick = { save(surah.number, v.number) }) { Icon(Icons.Default.Bookmark, contentDescription = "حفظ الآية", tint = if (isSaved(surah.number, v.number)) Gold else EmeraldLight); Text(if (isSaved(surah.number, v.number)) "محفوظة" else "حفظ") }
                    }
                }
            }
            item { Text("مصدر النص: Tanzil.net — النص معروض دون تعديل.", Modifier.fillMaxWidth().padding(12.dp), fontSize = 11.sp, textAlign = TextAlign.Center) }
        }
    }
}

@Composable
private fun SearchScreen(surahs: List<Surah>, query: String, setQuery: (String) -> Unit, open: (Int, Int) -> Unit) {
    val normalizedQuery = remember(query) { normalizeArabicForSearch(query.trim()) }
    val results = remember(normalizedQuery, surahs) {
        if (normalizedQuery.length < 2) emptyList()
        else surahs.flatMap { s ->
            s.verses.filter { normalizeArabicForSearch(it.text).contains(normalizedQuery) }
                .map { Pair(s, it) }
        }.take(100)
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("البحث في القرآن", fontSize = 23.sp, fontWeight = FontWeight.Bold)
        OutlinedTextField(query, setQuery, Modifier.fillMaxWidth(), label = { Text("اكتب كلمة أو عبارة") }, singleLine = true)
        Text(if (query.trim().length < 2) "اكتب حرفين على الأقل لبدء البحث." else "النتائج: " + results.size, Modifier.padding(vertical = 10.dp), fontSize = 12.sp)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(results) { result ->
                Card(Modifier.fillMaxWidth().clickable { open(result.first.number, result.second.number) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(result.first.name + " • الآية " + result.second.number, color = EmeraldLight, fontWeight = FontWeight.Bold)
                        Text(result.second.text, fontSize = 20.sp, lineHeight = 34.sp, textAlign = TextAlign.Right)
                    }
                }
            }
        }
    }
}

@Composable
private fun BookmarksScreen(
    bookmarks: List<String>,
    surahs: List<Surah>,
    onOpen: (Int, Int) -> Unit,
    onRemove: (String) -> Unit
) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("المحفوظات", fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Text("${bookmarks.size} آية محفوظة على جهازك", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = .7f))
        if (bookmarks.isEmpty()) {
            Text("لم تحفظ آيات بعد. افتح القراءة واضغط «حفظ» بجوار الآية.", Modifier.padding(top = 16.dp))
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(
                    bookmarks.sortedWith(
                        compareBy<String> { it.substringBefore(':').toIntOrNull() ?: Int.MAX_VALUE }
                            .thenBy { it.substringAfter(':').toIntOrNull() ?: Int.MAX_VALUE }
                    ),
                    key = { it }
                ) { key ->
                    val parts = key.split(":")
                    val s = parts.getOrNull(0)?.toIntOrNull() ?: 1
                    val a = parts.getOrNull(1)?.toIntOrNull() ?: 1
                    val surah = surahs.getOrNull(s - 1)
                    val verse = surah?.verses?.find { it.number == a }
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f).clickable { onOpen(s, a) }) {
                                    Text((surah?.name ?: "سورة") + " • الآية " + a, fontWeight = FontWeight.Bold, color = EmeraldLight)
                                }
                                IconButton(onClick = { onRemove(key) }) {
                                    Icon(Icons.Default.Delete, contentDescription = "إزالة الآية من المحفوظات", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                            Text(verse?.text ?: "", Modifier.fillMaxWidth().clickable { onOpen(s, a) }, fontSize = 20.sp, lineHeight = 32.sp, textAlign = TextAlign.Right)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MushafPagesScreen(page: Int, onPageChange: (Int) -> Unit) {
    val safePage = page.coerceIn(1, 604)
    val pageFile = safePage.toString().padStart(3, '0') + ".svg"
    val baseUrl = "file:///android_asset/mushaf/"
    val pageHtml = "<!doctype html><html><head><meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes'><style>html,body{margin:0;padding:0;background:#fff}img{width:100%;height:auto;display:block}</style></head><body><img src='$pageFile' alt='صفحة المصحف'></body></html>"
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { onPageChange(1) }, enabled = safePage > 1) { Text("الأولى") }
            Text("صفحة $safePage من 604", fontSize = 17.sp, fontWeight = FontWeight.Bold)
            TextButton(onClick = { onPageChange(604) }, enabled = safePage < 604) { Text("الأخيرة") }
        }
        Card(Modifier.weight(1f).fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    WebView(context).apply {
                        settings.javaScriptEnabled = false
                        settings.allowFileAccess = true
                        settings.allowContentAccess = false
                        setBackgroundColor(android.graphics.Color.WHITE)
                        settings.builtInZoomControls = true
                        settings.displayZoomControls = false
                        tag = pageFile
                        loadDataWithBaseURL(baseUrl, pageHtml, "text/html", "UTF-8", null)
                    }
                },
                update = { view ->
                    if (view.tag != pageFile) {
                        view.tag = pageFile
                        view.loadDataWithBaseURL(baseUrl, pageHtml, "text/html", "UTF-8", null)
                    }
                }
            )
        }
        Slider(value = safePage.toFloat(), onValueChange = { onPageChange(it.toInt().coerceIn(1, 604)) }, valueRange = 1f..604f, steps = 602)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = { onPageChange((safePage - 1).coerceAtLeast(1)) }, enabled = safePage > 1) { Text("السابق") }
            OutlinedButton(onClick = { onPageChange((safePage + 1).coerceAtMost(604)) }, enabled = safePage < 604) { Text("التالي") }
        }
        Text("صفحات مصحف المدينة النبوية — رواية حفص. تُحمّل ملفات الصفحات وقت بناء APK ثم تُعرض محليًا.", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = .65f), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun AudioScreen() {
    val context = LocalContext.current
    val surahs = remember { loadSurahs(context) }
    val player = remember { MediaPlayer() }
    val scope = rememberCoroutineScope()
    var selectedSurah by remember { mutableIntStateOf(1) }
    var menuExpanded by remember { mutableStateOf(false) }
    var prepared by remember { mutableStateOf(false) }
    var playing by remember { mutableStateOf(false) }
    var downloading by remember { mutableStateOf(false) }
    var durationMs by remember { mutableIntStateOf(1) }
    var positionMs by remember { mutableIntStateOf(0) }
    var seekTargetMs by remember { mutableIntStateOf(0) }
    var playbackError by remember { mutableStateOf<String?>(null) }
    var downloadMessage by remember { mutableStateOf<String?>(null) }
    var downloadedFiles by remember { mutableStateOf(setOf<Int>()) }

    fun audioFile(number: Int): java.io.File =
        java.io.File(java.io.File(context.filesDir, "audio"), number.toString().padStart(3, '0') + ".mp3")

    fun refreshDownloaded() {
        downloadedFiles = (1..114).filter { audioFile(it).isFile && audioFile(it).length() > 2048L }.toSet()
    }

    fun prepareLocalFile(number: Int) {
        val safeNumber = number.coerceIn(1, 114)
        val file = audioFile(safeNumber)
        if (!file.isFile || file.length() < 2048L) {
            prepared = false
            playbackError = "نزّل هذه السورة أولًا. يلزم اتصال بالإنترنت للتنزيل فقط."
            return
        }
        try {
            playing = false
            prepared = false
            positionMs = 0
            durationMs = 1
            playbackError = null
            player.reset()
            player.setOnPreparedListener { mp ->
                durationMs = mp.duration.coerceAtLeast(1)
                positionMs = 0
                prepared = true
                playing = false
            }
            player.setOnCompletionListener { mp ->
                playing = false
                positionMs = mp.duration.coerceAtLeast(0)
            }
            player.setOnErrorListener { _, _, _ ->
                playing = false
                prepared = false
                playbackError = "تعذر تشغيل الملف. احذف السورة وأعد تنزيلها."
                true
            }
            player.setDataSource(file.absolutePath)
            selectedSurah = safeNumber
            player.prepareAsync()
        } catch (_: Exception) {
            playing = false
            prepared = false
            playbackError = "تعذر فتح ملف التلاوة. حاول تنزيل السورة مرة أخرى."
        }
    }

    fun downloadSelectedSurah() {
        if (downloading) return
        val number = selectedSurah
        downloading = true
        playbackError = null
        downloadMessage = "جارٍ تنزيل السورة…"
        scope.launch {
            try {
                val file = withContext(Dispatchers.IO) { downloadMisharySurah(context, number) }
                refreshDownloaded()
                downloadMessage = "اكتمل التنزيل: " + (surahs.getOrNull(number - 1)?.name ?: "السورة " + number) +
                    " (" + formatAudioSize(file.length()) + "). يمكنك الاستماع إليها دون إنترنت."
                prepareLocalFile(number)
            } catch (_: Exception) {
                downloadMessage = null
                playbackError = "فشل التنزيل. تحقق من الإنترنت ثم حاول مجددًا."
            } finally {
                downloading = false
            }
        }
    }

    DisposableEffect(player) { onDispose { runCatching { player.release() } } }
    LaunchedEffect(Unit) { refreshDownloaded() }
    LaunchedEffect(playing, prepared) {
        while (playing && prepared) {
            try { if (player.isPlaying) positionMs = player.currentPosition.coerceIn(0, durationMs) } catch (_: Exception) { }
            delay(400)
        }
    }

    val selectedName = surahs.getOrNull(selectedSurah - 1)?.name ?: "السورة " + selectedSurah
    Column(Modifier.fillMaxSize().padding(18.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("التلاوة الصوتية", fontSize = 25.sp, fontWeight = FontWeight.Bold)
        Column(Modifier.fillMaxWidth().background(Emerald, RoundedCornerShape(24.dp)).padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Default.Headphones, contentDescription = null, tint = Gold, modifier = Modifier.size(54.dp))
            Text("نزّل ما تحتاجه فقط", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Bold)
            Text("القارئ: مشاري العفاسي", color = Gold, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Text("التطبيق الأساسي صغير. نزّل السورة عند توفر الإنترنت، ثم استمع إليها لاحقًا دون اتصال.",
                color = Color(0xFFD9E5DC), textAlign = TextAlign.Center, lineHeight = 22.sp)
        }
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("اختر السورة", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Box {
                    OutlinedButton(onClick = { menuExpanded = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(selectedSurah.toString() + ". " + selectedName)
                    }
                    DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }, modifier = Modifier.heightIn(max = 360.dp)) {
                        surahs.forEach { surah ->
                            DropdownMenuItem(
                                text = { Text(surah.number.toString() + ". " + surah.name + if (downloadedFiles.contains(surah.number)) " ✓" else "") },
                                onClick = {
                                    menuExpanded = false
                                    selectedSurah = surah.number
                                    prepared = false; playing = false; positionMs = 0; durationMs = 1
                                    playbackError = null; downloadMessage = null
                                    runCatching { player.reset() }
                                    if (downloadedFiles.contains(surah.number)) prepareLocalFile(surah.number)
                                }
                            )
                        }
                    }
                }
                Text("المحفوظ على الجهاز: " + downloadedFiles.size + " من 114 سورة", fontSize = 13.sp, color = EmeraldLight)
                downloadMessage?.let { Text(it, color = EmeraldLight, fontSize = 12.sp, lineHeight = 18.sp) }
                playbackError?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp) }
                Button(onClick = { downloadSelectedSurah() }, enabled = !downloading && !downloadedFiles.contains(selectedSurah), modifier = Modifier.fillMaxWidth()) {
                    Text(if (downloading) "جارٍ التنزيل…" else if (downloadedFiles.contains(selectedSurah)) "السورة محفوظة على الجهاز" else "تنزيل السورة للاستماع دون إنترنت")
                }
                if (downloading) LinearProgressIndicator(Modifier.fillMaxWidth())
                Slider(value = positionMs.coerceIn(0, durationMs).toFloat(),
                    onValueChange = { seekTargetMs = it.toInt(); positionMs = seekTargetMs },
                    onValueChangeFinished = { if (prepared) runCatching { player.seekTo(seekTargetMs.coerceIn(0, durationMs)) } },
                    valueRange = 0f..durationMs.coerceAtLeast(1).toFloat(), enabled = prepared)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(formatAudioTime(positionMs), fontSize = 12.sp)
                    Text(formatAudioTime(durationMs), fontSize = 12.sp)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = {
                        selectedSurah = (selectedSurah - 1).coerceAtLeast(1)
                        playbackError = null; downloadMessage = null; runCatching { player.reset() }; prepared = false; playing = false
                        if (downloadedFiles.contains(selectedSurah)) prepareLocalFile(selectedSurah)
                    }) { Text("السابق") }
                    Button(onClick = {
                        try {
                            if (playing) { player.pause(); playing = false }
                            else if (prepared) { player.start(); playing = true }
                        } catch (_: Exception) { playbackError = "تعذر بدء التلاوة. حاول اختيار السورة مرة أخرى." }
                    }, enabled = prepared) { Text(if (playing) "إيقاف مؤقت" else "تشغيل") }
                    OutlinedButton(onClick = {
                        selectedSurah = (selectedSurah + 1).coerceAtMost(114)
                        playbackError = null; downloadMessage = null; runCatching { player.reset() }; prepared = false; playing = false
                        if (downloadedFiles.contains(selectedSurah)) prepareLocalFile(selectedSurah)
                    }) { Text("التالي") }
                }
                if (downloadedFiles.contains(selectedSurah)) {
                    OutlinedButton(onClick = {
                        playing = false; prepared = false; runCatching { player.reset() }
                        val deleted = runCatching { audioFile(selectedSurah).delete() }.getOrDefault(false)
                        refreshDownloaded()
                        downloadMessage = if (deleted) "حُذفت السورة من الجهاز لتوفير المساحة." else "تعذر حذف الملف."
                        positionMs = 0; durationMs = 1
                    }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Default.Delete, contentDescription = null); Spacer(Modifier.width(8.dp)); Text("حذف السورة من الجهاز")
                    }
                }
                OutlinedButton(onClick = {
                    playing = false; prepared = false; runCatching { player.reset() }
                    val deleted = runCatching {
                        val dir = java.io.File(context.filesDir, "audio")
                        dir.listFiles()?.forEach { it.delete() }
                        dir.delete()
                    }.isSuccess
                    refreshDownloaded(); positionMs = 0; durationMs = 1
                    downloadMessage = if (deleted) "تم حذف ملفات التلاوة المحفوظة لتوفير المساحة." else "تعذر حذف بعض الملفات."
                }, modifier = Modifier.fillMaxWidth(), enabled = downloadedFiles.isNotEmpty() && !downloading) {
                    Text("حذف جميع السور المحفوظة (" + downloadedFiles.size + ")")
                }
            }
        }
        Text("الصوت من MP3Quran.net. يلزم الإنترنت لتنزيل السورة فقط؛ تبقى الملفات داخل مساحة التطبيق الخاصة وتعمل دون إنترنت. حذف التطبيق يمسح الملفات المحفوظة.",
            fontSize = 12.sp, lineHeight = 20.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = .75f))
    }
}

private suspend fun downloadMisharySurah(context: android.content.Context, surahNumber: Int): java.io.File =
    withContext(Dispatchers.IO) {
        val apiConnection = (java.net.URL("https://mp3quran.net/api/v3/reciters?language=eng").openConnection() as java.net.HttpURLConnection).apply {
            connectTimeout = 20000; readTimeout = 30000; requestMethod = "GET"
            setRequestProperty("User-Agent", "WirdQuranAndroid/1.0")
        }
        val server = try {
            val json = apiConnection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            val reciters = org.json.JSONObject(json).getJSONArray("reciters")
            var foundServer: String? = null
            for (i in 0 until reciters.length()) {
                val reciter = reciters.getJSONObject(i)
                val name = reciter.optString("name")
                if (!name.contains("Mishary", true) && !name.contains("مشاري") && !name.contains("Alafasi", true) && !name.contains("العفاسي")) continue
                val moshafs = reciter.optJSONArray("moshaf") ?: continue
                for (j in 0 until moshafs.length()) {
                    val moshaf = moshafs.getJSONObject(j)
                    val listed = moshaf.optString("surah_list").split(",").mapNotNull { it.trim().toIntOrNull() }.toSet()
                    if (moshaf.optInt("surah_total") == 114 && (1..114).all { it in listed }) {
                        val candidate = moshaf.optString("server").trimEnd('/') + "/"
                        if (candidate.startsWith("https://")) { foundServer = candidate; break }
                    }
                }
                if (foundServer != null) break
            }
            foundServer ?: throw java.io.IOException("Complete reciter catalogue entry not found")
        } finally { apiConnection.disconnect() }

        val dir = java.io.File(context.filesDir, "audio")
        if (!dir.exists() && !dir.mkdirs()) throw java.io.IOException("Could not create audio folder")
        val fileName = surahNumber.toString().padStart(3, '0') + ".mp3"
        val target = java.io.File(dir, fileName)
        val temp = java.io.File(dir, fileName + ".part")
        val connection = (java.net.URL(server + fileName).openConnection() as java.net.HttpURLConnection).apply {
            connectTimeout = 20000; readTimeout = 60000; requestMethod = "GET"
            setRequestProperty("User-Agent", "WirdQuranAndroid/1.0")
        }
        try {
            connection.connect()
            if (connection.responseCode !in 200..299) throw java.io.IOException("Audio server HTTP " + connection.responseCode)
            if (connection.contentType?.lowercase()?.contains("text/html") == true) throw java.io.IOException("Audio server returned HTML")
            connection.inputStream.use { input -> temp.outputStream().buffered().use { output -> input.copyTo(output) } }
            if (!temp.isFile || temp.length() < 2048L) throw java.io.IOException("Downloaded file is too small")
            val header = temp.inputStream().use { it.readNBytes(4) }
            val validMp3 = header.size >= 2 && (
                (header[0] == 'I'.code.toByte() && header[1] == 'D'.code.toByte()) ||
                ((header[0].toInt() and 0xFF) == 0xFF && (header[1].toInt() and 0xE0) == 0xE0)
            )
            if (!validMp3) throw java.io.IOException("Downloaded file is not MP3")
            if (target.exists()) target.delete()
            if (!temp.renameTo(target)) throw java.io.IOException("Could not save downloaded audio")
            target
        } catch (e: Exception) {
            temp.delete()
            throw e
        } finally { connection.disconnect() }
    }

private fun formatAudioSize(bytes: Long): String =
    if (bytes >= 1024L * 1024L) "%.1f MB".format(bytes.toDouble() / (1024L * 1024L))
    else (bytes / 1024L).toString() + " KB"

private fun formatAudioTime(milliseconds: Int): String {
    val totalSeconds = (milliseconds.coerceAtLeast(0) / 1000)
    return "%02d:%02d".format(totalSeconds / 60, totalSeconds % 60)
}

@Composable
private fun SettingsScreen(darkMode: Boolean, onDarkMode: (Boolean) -> Unit) {
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Text("الإعدادات", fontSize = 25.sp, fontWeight = FontWeight.Bold)
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("الوضع الليلي", fontWeight = FontWeight.Bold); Text("مظهر داكن مريح للعين", fontSize = 12.sp) }
                Switch(checked = darkMode, onCheckedChange = onDarkMode)
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("حول وِرد", fontWeight = FontWeight.Bold, color = EmeraldLight)
                Text("تطبيق دون ذكاء اصطناعي. النص القرآني من مشروع Tanzil ويُعرض دون تعديل؛ يلزم الاتصال بالإنترنت لتنزيل التلاوة الاختيارية فقط.", fontSize = 14.sp, lineHeight = 22.sp)
                Text("المصدر: https://tanzil.net", fontSize = 12.sp)
                Text("صفحات المصحف والنص والبحث والمحفوظات تعمل دون إنترنت. التلاوة اختيارية: نزّل السور التي تريدها مرة واحدة لتعمل لاحقًا دون اتصال.", fontSize = 12.sp, lineHeight = 19.sp)
            }
        }
    }
}


/**
 * Search-only normalization. Displayed Quran text is never changed.
 * This makes search tolerant of Arabic harakat and common alif/ya variants.
 */
private fun normalizeArabicForSearch(value: String): String {
    val decomposed = Normalizer.normalize(value, Normalizer.Form.NFD)
    return decomposed
        .replace(Regex("[\\u064B-\\u065F\\u0670\\u06D6-\\u06ED]"), "")
        .replace("ـ", "")
        .replace('أ', 'ا')
        .replace('إ', 'ا')
        .replace('آ', 'ا')
        .replace('ٱ', 'ا')
        .replace('ى', 'ي')
        .replace('ؤ', 'و')
        .replace('ئ', 'ي')
}
