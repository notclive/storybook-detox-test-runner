import type detox from 'detox'
import type { ComponentProps, ComponentType } from 'react'
import type { Args, Renderer, StoryAnnotations, StoryContext } from 'storybook/internal/types'

// I've:
// 1) Taken the definition of StoryObj from @storybook/react
// 2) Simplified it so I understand it by replacing `TMetaOrCmpOrArgs` with `CmpOrArgs`
// 3) Extended `StoryAnnotations` to include a `detox` argument in the play function
// I will need to replicate the more complicated definition from @storybook/react to support `DetoxStoryObj<typeof meta>`
export type DetoxStoryObj<CmpOrArgs = Args> = CmpOrArgs extends ComponentType<any> 
      ? DetoxStoryAnnotations<Renderer, ComponentProps<CmpOrArgs>> 
      : DetoxStoryAnnotations<Renderer, CmpOrArgs>

type DetoxStoryAnnotations<
    TRenderer extends Renderer = Renderer,
    TArgs = Args,
    TRequiredArgs = Partial<TArgs>
> = Omit<StoryAnnotations<TRenderer, TArgs, TRequiredArgs>, 'play'> & {
    detox?: {
        onlyOnOperatingSystems?: ('ios' | 'android')[]
        launch?: Detox.DeviceLaunchAppConfig
    }
    play?: (
        context: StoryContext<TRenderer, TArgs> 
          & { detox: typeof detox }
    ) => Promise<void> | void
}
