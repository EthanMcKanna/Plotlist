import SwiftUI
import WidgetKit

// The app writes this payload (lib/widget/upNextWidget.ts) whenever the
// episodeProgress:getUpNext query settles, so the widget mirrors the home
// rail without its own auth or RPC stack. Timeline entries are re-resolved
// at each local midnight so "Tonight" stays correct between app opens.

private let kAppGroup = "group.com.emckanna.Plotlist"
private let kPayloadKey = "upNextWidgetPayload"
private let kNewEpisodeWindow: TimeInterval = 14 * 24 * 60 * 60

// MARK: - Payload

struct UpNextPayload: Decodable {
  var version: Int
  var generatedAt: Double
  var items: [UpNextItem]
}

struct UpNextItem: Decodable, Identifiable {
  var showId: String
  var title: String
  var posterUrl: String?
  var season: Int
  var episode: Int
  var episodeName: String?
  var airDate: Double?
  var isUpcoming: Bool

  var id: String { showId }
  var episodeCode: String { "S\(season) E\(episode)" }

  var airDateValue: Date? {
    guard let ms = airDate else { return nil }
    return Date(timeIntervalSince1970: ms / 1000)
  }

  /// Deep link into the show page with the episode sheet auto-open params
  /// the app already understands (lib/episodeDeepLink.ts).
  var deepLinkURL: URL {
    var components = URLComponents()
    components.scheme = "plotlist"
    components.host = ""
    components.path = "/show/\(showId)"
    components.queryItems = [
      URLQueryItem(name: "openSeason", value: String(season)),
      URLQueryItem(name: "openEpisode", value: String(episode)),
    ]
    return components.url ?? URL(string: "plotlist:///continue")!
  }
}

func loadPayload() -> UpNextPayload? {
  guard
    let defaults = UserDefaults(suiteName: kAppGroup),
    let json = defaults.string(forKey: kPayloadKey),
    let data = json.data(using: .utf8)
  else { return nil }
  return try? JSONDecoder().decode(UpNextPayload.self, from: data)
}

// MARK: - Classification

enum AiringBadge {
  case tonight
  case newEpisode
  case ready
  case upcoming(Date)
  case waiting

  var sortRank: Int {
    switch self {
    case .tonight: return 0
    case .newEpisode: return 1
    case .ready: return 2
    case .upcoming: return 3
    case .waiting: return 4
    }
  }

  var isWatchable: Bool { sortRank <= 2 }

  var color: Color {
    switch self {
    case .tonight: return Color("tonight")
    case .newEpisode: return Color("fresh")
    case .ready: return .secondary
    case .upcoming, .waiting: return Color("returning")
    }
  }

  func label(relativeTo date: Date) -> String {
    switch self {
    case .tonight: return "Tonight"
    case .newEpisode: return "New"
    case .ready: return "Ready"
    case .waiting: return "Soon"
    case .upcoming(let air):
      let calendar = Calendar.current
      if calendar.isDate(air, inSameDayAs: calendar.date(byAdding: .day, value: 1, to: date) ?? date) {
        return "Tomorrow"
      }
      let formatter = DateFormatter()
      if let weekAway = calendar.date(byAdding: .day, value: 6, to: date), air < weekAway {
        formatter.dateFormat = "EEE"
      } else {
        formatter.dateFormat = "MMM d"
      }
      return formatter.string(from: air)
    }
  }
}

func badge(for item: UpNextItem, on date: Date) -> AiringBadge {
  if let air = item.airDateValue {
    if Calendar.current.isDate(air, inSameDayAs: date) { return .tonight }
    if air > date { return .upcoming(air) }
    if date.timeIntervalSince(air) <= kNewEpisodeWindow { return .newEpisode }
    return .ready
  }
  return item.isUpcoming ? .waiting : .ready
}

struct ResolvedItem: Identifiable {
  let item: UpNextItem
  let badge: AiringBadge
  var id: String { item.id }
}

// MARK: - Timeline

struct UpNextEntry: TimelineEntry {
  let date: Date
  let items: [ResolvedItem]
  let posters: [String: UIImage]
  let hasPayload: Bool

  var tonightCount: Int {
    items.filter { if case .tonight = $0.badge { return true } else { return false } }.count
  }

  static func resolve(payload: UpNextPayload?, posters: [String: UIImage], at date: Date) -> UpNextEntry {
    guard let payload else {
      return UpNextEntry(date: date, items: [], posters: [:], hasPayload: false)
    }
    // Stable sort: watchable tiers first, server rank preserved within a tier.
    let resolved = payload.items
      .map { ResolvedItem(item: $0, badge: badge(for: $0, on: date)) }
      .enumerated()
      .sorted { left, right in
        if left.element.badge.sortRank != right.element.badge.sortRank {
          return left.element.badge.sortRank < right.element.badge.sortRank
        }
        return left.offset < right.offset
      }
      .map(\.element)
    return UpNextEntry(date: date, items: Array(resolved.prefix(4)), posters: posters, hasPayload: true)
  }

  static var sample: UpNextEntry {
    let items = [
      UpNextItem(showId: "1", title: "Severance", posterUrl: nil, season: 2, episode: 5,
                 episodeName: "Trojan's Horse", airDate: Date().timeIntervalSince1970 * 1000, isUpcoming: false),
      UpNextItem(showId: "2", title: "The Bear", posterUrl: nil, season: 3, episode: 2,
                 episodeName: nil, airDate: nil, isUpcoming: false),
      UpNextItem(showId: "3", title: "Slow Horses", posterUrl: nil, season: 4, episode: 1,
                 episodeName: nil, airDate: nil, isUpcoming: false),
    ]
    let now = Date()
    return UpNextEntry(
      date: now,
      items: items.map { ResolvedItem(item: $0, badge: badge(for: $0, on: now)) },
      posters: [:],
      hasPayload: true
    )
  }
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> UpNextEntry { .sample }

  func getSnapshot(in context: Context, completion: @escaping (UpNextEntry) -> Void) {
    if context.isPreview {
      completion(.sample)
      return
    }
    Task {
      let payload = loadPayload()
      let posters = await fetchPosters(for: payload?.items ?? [])
      completion(UpNextEntry.resolve(payload: payload, posters: posters, at: Date()))
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<UpNextEntry>) -> Void) {
    Task {
      let now = Date()
      let payload = loadPayload()
      let posters = await fetchPosters(for: payload?.items ?? [])

      // One entry now, plus one just after each of the next two local
      // midnights so day-relative badges roll over without an app launch.
      var dates: [Date] = [now]
      let calendar = Calendar.current
      var dayStart = calendar.startOfDay(for: now)
      for _ in 0..<2 {
        guard let next = calendar.date(byAdding: .day, value: 1, to: dayStart) else { break }
        dayStart = next
        dates.append(next.addingTimeInterval(1))
      }

      let entries = dates.map { UpNextEntry.resolve(payload: payload, posters: posters, at: $0) }
      completion(Timeline(entries: entries, policy: .atEnd))
    }
  }

  /// Downloads poster art for the handful of rows the widget can show.
  /// TMDB URLs are rewritten to small renditions to stay inside the widget
  /// memory budget.
  private func fetchPosters(for items: [UpNextItem]) async -> [String: UIImage] {
    var posters: [String: UIImage] = [:]
    for (index, item) in items.prefix(5).enumerated() {
      guard let raw = item.posterUrl else { continue }
      let sized = raw.replacingOccurrences(
        of: "/t/p/w500",
        with: index == 0 ? "/t/p/w342" : "/t/p/w185"
      )
      guard let url = URL(string: sized) else { continue }
      if let (data, _) = try? await URLSession.shared.data(from: url),
         let image = UIImage(data: data) {
        posters[item.id] = image
      }
    }
    return posters
  }
}

// MARK: - Shared view pieces

struct BadgeLabel: View {
  let badge: AiringBadge
  let date: Date

  var body: some View {
    Text(badge.label(relativeTo: date).uppercased())
      .font(.system(size: 10, weight: .bold))
      .foregroundStyle(badge.color)
  }
}

struct PosterThumb: View {
  let image: UIImage?
  let width: CGFloat

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
      } else {
        ZStack {
          Color.white.opacity(0.08)
          Image(systemName: "tv")
            .font(.system(size: width * 0.4))
            .foregroundStyle(.secondary)
        }
      }
    }
    .frame(width: width, height: width * 1.5)
    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
  }
}

struct EmptyStateView: View {
  let hasPayload: Bool

  var body: some View {
    VStack(spacing: 4) {
      Image(systemName: hasPayload ? "checkmark.circle" : "tv")
        .font(.title3)
        .foregroundStyle(.secondary)
      Text(hasPayload ? "You're all caught up" : "Open Plotlist to load your shows")
        .font(.caption)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
  }
}

// MARK: - Home screen views

struct SmallWidgetView: View {
  let entry: UpNextEntry

  var body: some View {
    if let first = entry.items.first {
      VStack(alignment: .leading, spacing: 2) {
        Spacer()
        BadgeLabel(badge: first.badge, date: entry.date)
        Text(first.item.title)
          .font(.system(size: 15, weight: .semibold))
          .lineLimit(2)
          .foregroundStyle(.white)
        Text(first.item.episodeCode)
          .font(.caption2)
          .foregroundStyle(.white.opacity(0.7))
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetURL(first.item.deepLinkURL)
    } else {
      EmptyStateView(hasPayload: entry.hasPayload)
        .widgetURL(URL(string: "plotlist:///continue"))
    }
  }
}

struct SmallWidgetBackground: View {
  let entry: UpNextEntry

  var body: some View {
    if let first = entry.items.first, let poster = entry.posters[first.id] {
      ZStack {
        Image(uiImage: poster)
          .resizable()
          .scaledToFill()
        LinearGradient(
          colors: [.clear, .black.opacity(0.25), .black.opacity(0.85)],
          startPoint: .top,
          endPoint: .bottom
        )
      }
    } else {
      Color("$widgetBackground")
    }
  }
}

struct MediumWidgetView: View {
  let entry: UpNextEntry

  var body: some View {
    if entry.items.isEmpty {
      EmptyStateView(hasPayload: entry.hasPayload)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetURL(URL(string: "plotlist:///continue"))
    } else {
      VStack(alignment: .leading, spacing: 7) {
        ForEach(entry.items.prefix(3)) { resolved in
          Link(destination: resolved.item.deepLinkURL) {
            HStack(spacing: 10) {
              PosterThumb(image: entry.posters[resolved.id], width: 26)
              VStack(alignment: .leading, spacing: 1) {
                Text(resolved.item.title)
                  .font(.system(size: 13, weight: .semibold))
                  .lineLimit(1)
                Text(subtitle(for: resolved.item))
                  .font(.system(size: 11))
                  .foregroundStyle(.secondary)
                  .lineLimit(1)
              }
              Spacer(minLength: 4)
              BadgeLabel(badge: resolved.badge, date: entry.date)
            }
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
  }

  private func subtitle(for item: UpNextItem) -> String {
    if let name = item.episodeName, !name.isEmpty {
      return "\(item.episodeCode) · \(name)"
    }
    return item.episodeCode
  }
}

// MARK: - Lock screen views

struct InlineWidgetView: View {
  let entry: UpNextEntry

  var body: some View {
    if entry.tonightCount > 1 {
      Text("\(entry.tonightCount) episodes tonight")
    } else if let first = entry.items.first {
      if case .tonight = first.badge {
        Text("\(first.item.title) tonight")
      } else {
        Text("Up next: \(first.item.title) \(first.item.episodeCode)")
      }
    } else {
      Text(entry.hasPayload ? "All caught up" : "Open Plotlist")
    }
  }
}

struct CircularWidgetView: View {
  let entry: UpNextEntry

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      if entry.tonightCount > 0 {
        VStack(spacing: -2) {
          Text("\(entry.tonightCount)")
            .font(.system(size: 20, weight: .bold, design: .rounded))
          Text("2NITE")
            .font(.system(size: 7, weight: .bold))
            .foregroundStyle(.secondary)
        }
      } else {
        Image(systemName: "play.tv")
          .font(.title3)
      }
    }
    .widgetAccentable()
  }
}

struct RectangularWidgetView: View {
  let entry: UpNextEntry

  var body: some View {
    if let first = entry.items.first {
      VStack(alignment: .leading, spacing: 1) {
        Text(first.item.title)
          .font(.headline)
          .widgetAccentable()
          .lineLimit(1)
        Text("\(first.item.episodeCode) · \(first.badge.label(relativeTo: entry.date))")
          .font(.caption)
          .lineLimit(1)
        if entry.tonightCount > 1 {
          Text("+\(entry.tonightCount - 1) more tonight")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      Text(entry.hasPayload ? "All caught up" : "Open Plotlist")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

// MARK: - Widget

struct UpNextWidgetEntryView: View {
  @Environment(\.widgetFamily) var family
  var entry: UpNextEntry

  var body: some View {
    switch family {
    case .systemSmall:
      SmallWidgetView(entry: entry)
        .containerBackground(for: .widget) { SmallWidgetBackground(entry: entry) }
    case .accessoryInline:
      InlineWidgetView(entry: entry)
        .containerBackground(for: .widget) { Color.clear }
        .widgetURL(URL(string: "plotlist:///continue"))
    case .accessoryCircular:
      CircularWidgetView(entry: entry)
        .containerBackground(for: .widget) { Color.clear }
        .widgetURL(URL(string: "plotlist:///continue"))
    case .accessoryRectangular:
      RectangularWidgetView(entry: entry)
        .containerBackground(for: .widget) { Color.clear }
        .widgetURL(entry.items.first?.item.deepLinkURL ?? URL(string: "plotlist:///continue"))
    default:
      MediumWidgetView(entry: entry)
        .containerBackground(Color("$widgetBackground"), for: .widget)
    }
  }
}

@main
struct PlotlistWidgets: WidgetBundle {
  var body: some Widget {
    UpNextWidget()
  }
}

struct UpNextWidget: Widget {
  let kind = "UpNextWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      UpNextWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Up Next")
    .description("Tonight's episodes and what to continue watching.")
    .supportedFamilies([
      .systemSmall,
      .systemMedium,
      .accessoryInline,
      .accessoryCircular,
      .accessoryRectangular,
    ])
  }
}
