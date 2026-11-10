import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { IconComponent, IconName } from '../shared/icon.component';
import {
  VocabApiService,
  VocabGrammarCourse,
  VocabLanguage,
  VocabOverview,
  VocabTopic,
} from './vocab-api.service';

type TopicFilter = 'all' | 'new' | 'learning' | 'mastered';
type StudyMode = 'flashcard' | 'fill_blank' | 'listen_fill';
const VOCAB_LANGUAGE_STORAGE_KEY = 'nchat.vocab.language';

@Component({
  selector: 'app-vocab-page',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './vocab-page.component.html',
  styleUrl: './vocab-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VocabPageComponent implements OnInit {
  readonly loading = signal(true);
  readonly error = signal('');
  readonly overview = signal<VocabOverview | null>(null);
  readonly grammarCourses = signal<VocabGrammarCourse[]>([]);
  readonly language = signal<VocabLanguage>('en');
  readonly search = signal('');
  readonly filter = signal<TopicFilter>('all');
  readonly selectedTopicId = signal<string | null>(null);
  readonly wordCount = signal<10 | 15 | 30>(10);
  readonly mode = signal<StudyMode>('flashcard');
  readonly startNotice = signal('');

  readonly topics = computed(() => this.overview()?.topics ?? []);
  readonly topicGroups = computed(() => {
    const groups = new Map<string, { slug: string; name: string; order: number; topics: VocabTopic[] }>();
    for (const topic of this.filteredTopics()) {
      let group = groups.get(topic.groupSlug);
      if (!group) {
        group = { slug: topic.groupSlug, name: topic.groupName, order: topic.groupOrder, topics: [] };
        groups.set(topic.groupSlug, group);
      }
      group.topics.push(topic);
    }
    return [...groups.values()].sort((left, right) => left.order - right.order);
  });
  readonly selectedTopic = computed(() => this.topics().find((topic) => topic.id === this.selectedTopicId()) ?? null);
  readonly continueTopic = computed(() =>
    this.topics().find((topic) => topic.id === this.overview()?.summary.continueTopicId) ?? null,
  );
  readonly filteredTopics = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('vi');
    const selectedFilter = this.filter();
    return this.topics().filter((topic) => {
      const matchesSearch = !query || `${topic.name} ${topic.description}`.toLocaleLowerCase('vi').includes(query);
      const matchesFilter = selectedFilter === 'all'
        || (selectedFilter === 'new' && topic.masteredCount === 0 && topic.learningCount === 0)
        || (selectedFilter === 'learning' && topic.learningCount > 0)
        || (selectedFilter === 'mastered' && topic.progressPercent === 100);
      return matchesSearch && matchesFilter;
    });
  });

  readonly wordCounts: readonly (10 | 15 | 30)[] = [10, 15, 30];
  readonly modes: readonly { id: StudyMode; title: string; description: string; icon: IconName }[] = [
    { id: 'flashcard', title: 'Flashcard', description: 'Lật thẻ để ghi nhớ từ và nghĩa.', icon: 'cards' },
    { id: 'fill_blank', title: 'Điền từ', description: 'Hoàn thành câu với từ phù hợp.', icon: 'edit' },
    { id: 'listen_fill', title: 'Nghe và điền từ', description: 'Nghe phát âm rồi nhập từ bạn nghe được.', icon: 'headphones' },
  ];

  constructor(
    private readonly api: VocabApiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const queryLanguage = this.route.snapshot.queryParamMap.get('language');
    let storedLanguage: string | null = null;
    try {
      storedLanguage = typeof window === 'undefined' ? null : window.localStorage.getItem(VOCAB_LANGUAGE_STORAGE_KEY);
    } catch (error) {
      console.warn('Không thể đọc ngôn ngữ học đã lưu', error);
    }
    const language: VocabLanguage = queryLanguage === 'zh'
      ? 'zh'
      : queryLanguage === 'en'
        ? 'en'
        : storedLanguage === 'zh' ? 'zh' : 'en';
    this.language.set(language);
    this.persistLanguage(language);
    if (!queryLanguage && storedLanguage === 'zh') {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { language },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const language = this.language();
      const [overview, grammar] = await Promise.all([
        this.api.overview(language),
        language === 'zh' ? this.api.grammar('zh') : Promise.resolve({ courses: [] }),
      ]);
      this.overview.set(overview);
      this.grammarCourses.set(grammar.courses);
      if (this.route.snapshot.queryParamMap.get('review') === 'wrong') {
        const topicId = this.route.snapshot.queryParamMap.get('topicId');
        const topic = overview.topics.find((item) => item.id === topicId);
        if (topic) {
          this.selectedTopicId.set(topic.id);
          this.startNotice.set('Bài học sẽ ưu tiên các từ bạn vừa trả lời sai.');
        }
      }
    } catch (error) {
      console.error('Không tải được danh sách khóa học từ vựng', error);
      this.error.set(error instanceof Error ? error.message : 'Không tải được dữ liệu. Vui lòng thử lại.');
    } finally {
      this.loading.set(false);
    }
  }

  selectLanguage(language: VocabLanguage): void {
    if (this.language() === language) {
      return;
    }
    this.language.set(language);
    this.persistLanguage(language);
    this.selectedTopicId.set(null);
    this.search.set('');
    this.filter.set('all');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { language },
      queryParamsHandling: 'merge',
    });
    void this.load();
  }

  setSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.search.set(event.target.value);
    }
  }

  chooseTopic(topic: VocabTopic): void {
    this.selectedTopicId.set(topic.id);
    this.startNotice.set('');
  }

  backToCourses(): void {
    this.selectedTopicId.set(null);
    this.startNotice.set('');
  }

  selectMode(mode: StudyMode): void {
    this.mode.set(mode);
    this.startNotice.set('');
  }

  continueLearning(): void {
    const topic = this.continueTopic();
    if (topic) {
      this.chooseTopic(topic);
    }
  }

  async startStudy(): Promise<void> {
    const topic = this.selectedTopic();
    if (!topic) {
      return;
    }
    this.startNotice.set('');
    const studyRoute = this.mode() === 'flashcard'
      ? '/vocab/study'
      : this.mode() === 'fill_blank'
        ? '/vocab/fill-in'
        : '/vocab/listen-fill';
    await this.router.navigate([studyRoute], {
      queryParams: { topicId: topic.id, wordCount: this.wordCount(), mode: this.mode(), language: this.language() },
    });
  }

  exitToChat(): void {
    void this.router.navigateByUrl('/');
  }

  private persistLanguage(language: VocabLanguage): void {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(VOCAB_LANGUAGE_STORAGE_KEY, language);
      }
    } catch (error) {
      console.warn('Không thể lưu ngôn ngữ học đã chọn', error);
    }
  }
}
