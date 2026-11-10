import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { IconComponent, IconName } from '../shared/icon.component';
import { VocabApiService, VocabOverview, VocabTopic } from './vocab-api.service';

type TopicFilter = 'all' | 'new' | 'learning' | 'mastered';
type StudyMode = 'flashcard' | 'fill_blank' | 'listen_fill';

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
  readonly search = signal('');
  readonly filter = signal<TopicFilter>('all');
  readonly selectedTopicId = signal<string | null>(null);
  readonly wordCount = signal<10 | 15 | 30>(10);
  readonly mode = signal<StudyMode>('flashcard');
  readonly startNotice = signal('');

  readonly topics = computed(() => this.overview()?.topics ?? []);
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
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.overview.set(await this.api.overview());
    } catch (error) {
      console.error('Không tải được danh sách khóa học từ vựng', error);
      this.error.set(error instanceof Error ? error.message : 'Không tải được dữ liệu. Vui lòng thử lại.');
    } finally {
      this.loading.set(false);
    }
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
      queryParams: { topicId: topic.id, wordCount: this.wordCount(), mode: this.mode() },
    });
  }

  exitToChat(): void {
    void this.router.navigateByUrl('/');
  }
}
