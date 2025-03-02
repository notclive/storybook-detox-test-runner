import { Args, Renderer, StoryAnnotations } from '@storybook/core/types'
import type detox from 'detox'
import type { ComponentProps, ComponentType } from 'react'

interface DetoxRenderer extends Renderer {
  canvasElement: typeof detox
}

export type DetoxStoryObj<CmpOrArgs = Args> = CmpOrArgs extends ComponentType<any> 
      ? StoryAnnotations<DetoxRenderer, ComponentProps<CmpOrArgs>> 
      : StoryAnnotations<DetoxRenderer, CmpOrArgs>
