import SwiftUI
import LockInKit

/// The 1080 by 1350 card that gets shared. Drawn at full size, shown scaled down in the sheet.
struct RecordShareCard: View {
    let data: CardData
    let theme: LITheme
    let before: UIImage?
    let after: UIImage?

    static let width: CGFloat = 1080
    static let height: CGFloat = 1350

    var body: some View {
        ZStack(alignment: .topLeading) {
            theme.bg
            VStack(alignment: .leading, spacing: 0) {
                Text("LOCK IN")
                    .font(LIFont.medium(30)).tracking(6)
                    .foregroundColor(theme.ink2)
                Text(data.eyebrow.uppercased())
                    .font(LIFont.medium(30)).tracking(4)
                    .foregroundColor(theme.ink2)
                    .padding(.top, 70)
                HStack(alignment: .firstTextBaseline, spacing: 20) {
                    Text(data.big).font(LIFont.medium(260)).tracking(-10).foregroundColor(theme.ink)
                    Text(data.bigSub).font(LIFont.regular(64)).foregroundColor(theme.ink2)
                }
                .padding(.top, 6)
                Text(data.range).font(LIFont.regular(34)).foregroundColor(theme.ink2).padding(.top, 4)
                grid.padding(.top, 52)
                Spacer(minLength: 0)
                HStack(alignment: .top, spacing: 0) {
                    stat("\(data.percent)%", "Locked in")
                    stat("\(data.lockedIn)", "Full days")
                    stat(data.extraValue, data.extraLabel)
                }
                if !data.streaks.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(data.streaks.enumerated()), id: \.offset) { _, s in
                            HStack {
                                Text(s.name).font(LIFont.regular(34)).foregroundColor(theme.ink)
                                Spacer()
                                Text(ProgressRules.countLabel(s.current, s.unit)).font(LIFont.medium(34)).foregroundColor(theme.ink)
                            }
                        }
                    }
                    .padding(.top, 36)
                }
                if before != nil || after != nil {
                    HStack(spacing: 20) {
                        photo(before, data.before?.label)
                        photo(after, data.after?.label)
                    }
                    .padding(.top, 36)
                }
            }
            .padding(80)
        }
        .frame(width: Self.width, height: Self.height)
        .environment(\.liTheme, theme)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(value).font(LIFont.medium(64)).tracking(-2).foregroundColor(theme.ink)
            Text(label.uppercased()).font(LIFont.medium(24)).tracking(3).foregroundColor(theme.ink2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func photo(_ image: UIImage?, _ label: String?) -> some View {
        if let image = image {
            ZStack(alignment: .bottomLeading) {
                Image(uiImage: image).resizable().scaledToFill()
                    .frame(maxWidth: .infinity).frame(height: 300).clipped()
                Text(label ?? "").font(LIFont.medium(26)).foregroundColor(.white)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Color.black.opacity(0.45)).padding(12)
            }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
    }

    private var grid: some View {
        let size: CGFloat = 108
        let gap: CGFloat = 12
        let cols = Array(repeating: GridItem(.fixed(size), spacing: gap), count: 7)
        return LazyVGrid(columns: cols, alignment: .leading, spacing: gap) {
            ForEach(0..<data.lead, id: \.self) { _ in Color.clear.frame(width: size, height: size) }
            ForEach(Array(data.cells.enumerated()), id: \.offset) { _, c in
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(fill(c.kind))
                    .frame(width: size, height: size)
                    .overlay {
                        if c.isToday {
                            RoundedRectangle(cornerRadius: 32, style: .continuous).strokeBorder(theme.ink, lineWidth: 4).padding(-6)
                        }
                    }
            }
        }
        .frame(width: size * 7 + gap * 6, alignment: .leading)
    }

    private func fill(_ kind: ProgressCellKind) -> AnyShapeStyle {
        switch kind {
        case .full: return AnyShapeStyle(theme.gradient)
        case .partial: return AnyShapeStyle(theme.ink3.opacity(0.55))
        case .missed, .open: return AnyShapeStyle(theme.tile)
        case .future, .before: return AnyShapeStyle(theme.hair)
        }
    }
}

struct RecordShareSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    let model: RecordModel

    @State private var data: CardData? = nil
    @State private var beforeImage: UIImage? = nil
    @State private var afterImage: UIImage? = nil
    @State private var useBefore = false
    @State private var useAfter = false
    @State private var fileURL: URL? = nil

    private var shownBefore: UIImage? { return useBefore ? beforeImage : nil }
    private var shownAfter: UIImage? { return useAfter ? afterImage : nil }

    var body: some View {
        NavigationStack {
            ZStack {
                LIBackground()
                ScrollView {
                    VStack(spacing: 20) {
                        if let data = data {
                            RecordShareCard(data: data, theme: theme, before: shownBefore, after: shownAfter)
                                .scaleEffect(scale, anchor: .topLeading)
                                .frame(width: RecordShareCard.width * scale, height: RecordShareCard.height * scale, alignment: .topLeading)
                                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                            if beforeImage != nil || afterImage != nil {
                                VStack(spacing: 0) {
                                    if beforeImage != nil {
                                        toggle("Include the before photo", $useBefore)
                                    }
                                    if afterImage != nil {
                                        toggle("Include the latest photo", $useAfter)
                                    }
                                }
                            }
                            if let url = fileURL {
                                ShareLink(item: url, preview: SharePreview(data.caption)) {
                                    Text("Share")
                                        .liType(.body)
                                        .foregroundColor(theme.accentInk)
                                        .frame(maxWidth: .infinity, minHeight: 52)
                                        .background(theme.gradient, in: Capsule())
                                }
                                .simultaneousGesture(TapGesture().onEnded { LIHaptics.tap() })
                            }
                        } else {
                            LIEmptyState(title: "Nothing to share yet", message: "Your record loads in a moment.")
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle("Share")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
        .task {
            let d = model.cardData(store)
            data = d
            if let ref = d?.before?.ref { beforeImage = await RecordModel.loadPhoto(ref) }
            if let ref = d?.after?.ref { afterImage = await RecordModel.loadPhoto(ref) }
            render()
        }
        .onChange(of: useBefore) { _, _ in render() }
        .onChange(of: useAfter) { _, _ in render() }
    }

    private var scale: CGFloat {
        let w = UIScreen.main.bounds.width - 40
        return min(0.4, w / RecordShareCard.width)
    }

    private func toggle(_ title: String, _ binding: Binding<Bool>) -> some View {
        Toggle(isOn: binding) {
            Text(title).liType(.body).foregroundColor(theme.ink)
        }
        .tint(theme.accent)
        .frame(minHeight: 48)
    }

    @MainActor
    private func render() {
        guard let data = data else { return }
        let renderer = ImageRenderer(content: RecordShareCard(data: data, theme: theme, before: shownBefore, after: shownAfter))
        renderer.scale = 1
        guard let image = renderer.uiImage, let png = image.pngData() else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("lock-in-\(data.fileTag).png")
        do {
            try png.write(to: url, options: .atomic)
            fileURL = url
        } catch {
            fileURL = nil
        }
    }
}
